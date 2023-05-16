<script lang="ts">
import { CredentialsState } from './manageCredentials.vue'
import { authForms } from './baseAuth.vue'

/**
 * The state instance of all auth forms
 */
const authFormsState = {
    [authForms.CREDENTIALS]: new CredentialsState(),
} as const

export default authFormsState
</script>
