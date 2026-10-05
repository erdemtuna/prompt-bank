import {
  Button, Toast, ToastBody, Toaster, ToastFooter, ToastTitle,
  makeStyles, useId, useToastController
} from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';
import { useEffect, useRef } from 'react';
import type { FavoriteFailure } from '../data/favoritesController';

const useStyles = makeStyles({
  toast: {
    width: '360px',
    maxWidth: 'calc(100vw - 32px)',
    boxSizing: 'border-box',
    backgroundColor: 'var(--sw-panel)',
    color: 'var(--sw-ink)',
    borderLeft: '3px solid var(--sw-accent-strong)',
    fontFamily: 'var(--sw-sans)'
  },
  body: { overflowWrap: 'anywhere' },
  action: {
    color: 'var(--sw-ink)',
    ':hover': { color: 'var(--sw-ink)', backgroundColor: 'var(--sw-fill)' },
    ':active': { color: 'var(--sw-ink)' }
  }
});

type Props = {
  failures: FavoriteFailure[];
  onRetry: (key: string | null) => Promise<void>;
  onDismiss: (failure: FavoriteFailure) => void;
};
type DisplayedToast = { element: HTMLDivElement | null; restoreFocus: boolean };

export function FavoritesFeedback({ failures, onRetry, onDismiss }: Props) {
  const styles = useStyles();
  const toasterId = useId('favorite-errors');
  const { dispatchToast, dismissToast } = useToastController(toasterId);
  const displayed = useRef(new Map<string, DisplayedToast>());

  useEffect(() => {
    const wanted = new Set(failures.map((failure) => failure.id));
    for (const [id, entry] of displayed.current) {
      if (wanted.has(id)) continue;
      entry.restoreFocus ||= Boolean(entry.element?.contains(document.activeElement));
      dismissToast(id);
      displayed.current.delete(id);
    }
    for (const failure of failures) {
      if (displayed.current.has(failure.id)) continue;
      const entry: DisplayedToast = { element: null, restoreFocus: false };
      displayed.current.set(failure.id, entry);
      dispatchToast(
        <Toast className={styles.toast} ref={(element) => { entry.element = element; }}>
          <ToastTitle
            action={
              <Button
                className={styles.action}
                appearance="subtle"
                icon={<DismissRegular />}
                aria-label="Dismiss favorite notification"
                onClick={() => {
                  entry.restoreFocus = Boolean(entry.element?.contains(document.activeElement));
                  onDismiss(failure);
                }}
              />
            }
          >
            {failure.title}
          </ToastTitle>
          <ToastBody className={styles.body}>{failure.message}</ToastBody>
          <ToastFooter>
            <Button className={styles.action} appearance="subtle" onClick={() => { void onRetry(failure.key); }}>
              Retry
            </Button>
          </ToastFooter>
        </Toast>,
        {
          toastId: failure.id, intent: 'error', position: 'bottom-start',
          timeout: -1,
          onStatusChange: (_, data) => {
            if (data.status === 'dismissed') {
              entry.restoreFocus ||= Boolean(entry.element?.contains(document.activeElement));
              onDismiss(failure);
            }
            if (data.status === 'unmounted' && entry.restoreFocus) {
              if (failure.restoreFocus) failure.restoreFocus();
              else document.getElementById('pb-search')?.focus();
            }
          }
        }
      );
    }
  }, [failures, onRetry, onDismiss, dismissToast, dispatchToast, styles.toast, styles.body, styles.action]);

  return <Toaster toasterId={toasterId} position="bottom-start" limit={2} offset={{ horizontal: 16, vertical: 16 }} />;
}
