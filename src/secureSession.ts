import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as aesjs from 'aes-js';

// Supabase sessions outgrow SecureStore's ~2KB value limit, so the session is
// AES-encrypted into AsyncStorage and only the key lives in the OS keystore.
const PREFIX = 'enc1:';

const keyName = (key: string) => `${key.replace(/[^A-Za-z0-9._-]/g, '_')}.k`;

async function encrypt(key: string, value: string) {
  const secret = Crypto.getRandomBytes(32);
  const cipher = new aesjs.ModeOfOperation.ctr(secret, new aesjs.Counter(1));
  const bytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
  await SecureStore.setItemAsync(keyName(key), aesjs.utils.hex.fromBytes(secret));
  return PREFIX + aesjs.utils.hex.fromBytes(bytes);
}

async function decrypt(key: string, stored: string) {
  const hex = await SecureStore.getItemAsync(keyName(key));
  if (!hex) return null;
  const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(hex), new aesjs.Counter(1));
  const bytes = cipher.decrypt(aesjs.utils.hex.toBytes(stored.slice(PREFIX.length)));
  return aesjs.utils.utf8.fromBytes(bytes);
}

export const secureSessionStorage = {
  async getItem(key: string) {
    const stored = await AsyncStorage.getItem(key);
    if (!stored) return null;
    if (!stored.startsWith(PREFIX)) {
      // migrate - sessions saved by older builds are plaintext
      await AsyncStorage.setItem(key, await encrypt(key, stored));
      return stored;
    }
    try {
      return await decrypt(key, stored);
    } catch {
      // unreadable (keystore reset, e.g. after a restore) - drop it; user signs in again
      await secureSessionStorage.removeItem(key);
      return null;
    }
  },
  async setItem(key: string, value: string) {
    await AsyncStorage.setItem(key, await encrypt(key, value));
  },
  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(keyName(key));
  },
};
