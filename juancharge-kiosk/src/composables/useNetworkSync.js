import { useNetwork } from '@vueuse/core';
import { watch } from 'vue';
import { syncTransactions } from '../services/syncService.js';

export function useNetworkSync() {
  const { isOnline } = useNetwork();

  watch(isOnline, (online) => {
    if (online) {
      console.log('🟢 Internet restored, syncing transactions...');
      syncTransactions();
    }
  });
}
