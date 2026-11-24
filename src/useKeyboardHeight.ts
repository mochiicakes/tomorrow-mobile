import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, LayoutAnimation, Platform } from 'react-native';

// tracks the on-screen keyboard height (0 when hidden)
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const animate = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    // measure from the screen bottom to the keyboard top — on edge-to-edge Android
    // the reported height leaves out the nav bar sitting under the keyboard
    const show = Keyboard.addListener(showEvt, e => {
      animate();
      const fromBottom = Dimensions.get('screen').height - e.endCoordinates.screenY;
      setHeight(Math.max(e.endCoordinates.height, fromBottom));
    });
    const hide = Keyboard.addListener(hideEvt, () => { animate(); setHeight(0); });
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}
