<script lang="ts">
import AwsExplorerContent, { ResourceExplorerContentState } from './awsExplorerContent.vue'
import DocumentTypesContent from './documentTypesContent.vue'
import { UnimplementedAuthStatus } from '../authForms/baseAuth.vue'
import { AuthStatus } from '../authForms/shared.vue'
import CodeWhispererContent, { CodeWhispererContentState } from './codeWhispererContent.vue'
import CodeCatalystContent, { CodeCatalystContentState } from './codeCatalystContent.vue'
import { DefinedComponent } from '../../../../webviews/types'
import { ServiceItemId } from '../backend/types'

/** Maps a service item id to its respective component */
const serviceItemsContent: Readonly<Record<ServiceItemId, DefinedComponent>> = {
    DOCUMENT_TYPE_SUPPORT: DocumentTypesContent,
    RESOURCE_EXPLORER: AwsExplorerContent,
    CODE_CATALYST: CodeCatalystContent,
    CODE_WHISPERER: CodeWhispererContent,
}

/**
 * Maps a service item id to the content window state.
 *
 * This knows about the overall connection status for
 * the current service.
 */
export const serviceItemsAuthStatus: Readonly<Record<ServiceItemId, AuthStatus>> = {
    DOCUMENT_TYPE_SUPPORT: new UnimplementedAuthStatus(),
    RESOURCE_EXPLORER: new ResourceExplorerContentState(),
    CODE_CATALYST: new CodeCatalystContentState(),
    CODE_WHISPERER: new CodeWhispererContentState(),
} as const

export default serviceItemsContent
</script>
