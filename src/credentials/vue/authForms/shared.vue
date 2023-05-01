<script lang="ts">
import { CredentialsState } from './CredentialsForm.vue'
import { authForms } from './BaseAuthForm.vue'

/**
 * The state instance of all auth forms
 */
const authFormsState = {
    [authForms.CREDENTIALS]: new CredentialsState(),
} as const

export default authFormsState
</script>
