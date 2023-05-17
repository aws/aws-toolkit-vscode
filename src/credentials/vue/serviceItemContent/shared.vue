<script lang="ts">
import AwsExplorerContent, { ResourceExplorerContentState } from './awsExplorerContent.vue'
import BaseServiceItemContent from './baseServiceItemContent.vue'
import { ServiceItemId, serviceItemIds } from '../serviceItem.vue'
import { AuthStatus, UnimplementedAuthStatus } from '../authForms/baseAuth.vue'

/** Maps a service item id to its respective component */
const serviceItemsContent = {
    [serviceItemIds.NON_AUTH_FEATURES]: BaseServiceItemContent,
    [serviceItemIds.RESOURCE_EXPLORER]: AwsExplorerContent,
    [serviceItemIds.CODE_CATALYST]: BaseServiceItemContent,
    [serviceItemIds.CODE_WHISPERER]: BaseServiceItemContent,
} as const

/**
 * Maps a service item id to the content window state.
 *
 * This knows about the overall connection status for
 * the current service.
 */
export const serviceItemsAuthStatus: Record<ServiceItemId, AuthStatus> = {
    [serviceItemIds.NON_AUTH_FEATURES]: new UnimplementedAuthStatus(),
    [serviceItemIds.RESOURCE_EXPLORER]: new ResourceExplorerContentState(),
    [serviceItemIds.CODE_CATALYST]: new UnimplementedAuthStatus(),
    [serviceItemIds.CODE_WHISPERER]: new UnimplementedAuthStatus(),
} as const

export default serviceItemsContent
</script>
