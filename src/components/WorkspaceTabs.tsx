import {
  Button,
  Menu,
  MenuDivider,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Tab,
  TabList,
  makeStyles
} from '@fluentui/react-components';
import { Fragment } from 'react';
import type { WorkspaceSummaryDto } from '../data/desktopClient';

export type TabDescriptor = { id: string; label: string; closable: boolean; busy: boolean };

type Props = {
  tabs: TabDescriptor[];
  activeTabId: string;
  recents: WorkspaceSummaryDto[];
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onOpenFolder: () => void;
  onOpenRecent: (id: string) => void;
  onForgetRecent: (id: string) => void;
};

const useStyles = makeStyles({
  bar: {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '1360px',
    margin: '0 auto',
    padding: '0 40px 8px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    overflowX: 'auto',
    '@media (max-width: 900px)': { padding: '0 20px 8px' }
  },
  tabs: { flexShrink: 0 },
  spacer: { flex: 1, minWidth: '8px' },
  actions: { display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }
});

export function WorkspaceTabs({
  tabs,
  activeTabId,
  recents,
  onSelectTab,
  onCloseTab,
  onOpenFolder,
  onOpenRecent,
  onForgetRecent
}: Props) {
  const styles = useStyles();
  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  return (
    <div className={styles.bar}>
      <TabList
        className={styles.tabs}
        selectedValue={activeTabId}
        onTabSelect={(_event, data) => onSelectTab(data.value as string)}
        aria-label="Open workspaces"
      >
        {tabs.map((tab) => (
          <Tab key={tab.id} value={tab.id}>
            {tab.busy ? `${tab.label} …` : tab.label}
          </Tab>
        ))}
      </TabList>

      <span className={styles.spacer} />

      <div className={styles.actions}>
        {activeTab?.closable ? (
          <Button size="small" appearance="subtle" aria-label={`Close ${activeTab.label}`} onClick={() => onCloseTab(activeTab.id)}>
            Close
          </Button>
        ) : null}
        <Button size="small" appearance="secondary" onClick={onOpenFolder}>
          Open folder
        </Button>
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button size="small" appearance="subtle">
              Recent folders
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {recents.length === 0 ? (
                <MenuItem disabled>No recent folders</MenuItem>
              ) : (
                recents.map((recent, index) => (
                  <Fragment key={recent.id}>
                    {index > 0 ? <MenuDivider /> : null}
                    <MenuItem onClick={() => onOpenRecent(recent.id)}>Open {recent.label}</MenuItem>
                    <MenuItem onClick={() => onForgetRecent(recent.id)}>Forget {recent.label}</MenuItem>
                  </Fragment>
                ))
              )}
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>
    </div>
  );
}
