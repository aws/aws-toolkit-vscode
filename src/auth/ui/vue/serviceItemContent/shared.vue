<script lang="ts">
import AwsExplorerContent, { ResourceExplorerContentState } from './awsExplorerContent.vue'
import DocumentTypesContent from './documentTypesContent.vue'
import { UnimplementedAuthStatus } from '../authForms/baseAuth.vue'
import { AuthStatus } from '../authForms/shared.vue'
import CodeWhispererContent, { CodeWhispererContentState } from './codeWhispererContent.vue'
import CodeCatalystContent, { CodeCatalystContentState } from './codeCatalystContent.vue'
import { DefinedComponent } from '../../../../webviews/types'
import { ServiceItemId } from '../types'

/** Maps a service item id to its respective component */
const serviceItemsContent: Readonly<Record<ServiceItemId, DefinedComponent>> = {
    documentTypeSupport: DocumentTypesContent,
    resourceExplorer: AwsExplorerContent,
    codecatalyst: CodeCatalystContent,
    codewhisperer: CodeWhispererContent,
}

/**
 * Maps a service item id to the content window state.
 *
 * This knows about the overall connection status for
 * the current service.
 */
export const serviceItemsAuthStatus: Readonly<Record<ServiceItemId, AuthStatus>> = {
    documentTypeSupport: new UnimplementedAuthStatus(),
    resourceExplorer: new ResourceExplorerContentState(),
    codecatalyst: new CodeCatalystContentState(),
    codewhisperer: new CodeWhispererContentState(),
} as const

export default serviceItemsContent
</script>
