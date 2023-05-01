<script lang="ts">
import AwsExplorerContent from './AwsExplorerContent.vue'
import RootServiceItemContent from './RootServiceItemContent.vue'
import { serviceItemIds } from '../ServiceItem.vue'

const serviceItemsContent = {
    [serviceItemIds.NON_AUTH_FEATURES]: RootServiceItemContent,
    [serviceItemIds.RESOURCE_EXPLORER]: AwsExplorerContent,
    [serviceItemIds.CODE_CATALYST]: RootServiceItemContent,
    [serviceItemIds.CODE_WHISPERER]: RootServiceItemContent,
} as const

export default serviceItemsContent
</script>
