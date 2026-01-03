import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { get, set, del } from 'idb-keyval';

export type UseIdbKeyvalResult<S> = [
  item: S,
  setItem: Dispatch<SetStateAction<S>>,
  clearItem: () => void,
];

// https://github.com/brandonpittman/use-idb-keyval/blob/master/packages/use-idb-keyval/src/index.ts
export function useIdbKeyval<S>(key: string, initialState: S): UseIdbKeyvalResult<S>;
export function useIdbKeyval<S>(key: string, initialState: () => S): UseIdbKeyvalResult<S> {
  const [item, setItem] = useState(initialState);

  const reset = () => {
    const res =
      typeof initialState === 'function' ? initialState() : initialState;
    setItem(() => res);
    del(key);
  };

  useEffect(() => {
    (async () => {
      if (typeof window !== 'undefined') {
        const value = await get(key);
        if (value) {
          setItem(value);
        } else {
          const valueToSet =
            typeof initialState === 'function' ? initialState() : initialState;
          setItem(valueToSet);
          set(key, valueToSet);
        }
      }
    })();
  }, [key, item, initialState]);

  return [
    item,
    (value) => {
      if (typeof value === 'function') {
        setItem((prev: typeof item) => {
          const nextValue = (value as ((prevState: S) => S))(prev);
          set(key, nextValue);
          return nextValue;
        });
      } else {
        setItem(value);
        set(key, value);
      }
    },
    reset,
  ] as const;
}
