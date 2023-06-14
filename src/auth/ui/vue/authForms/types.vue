<script lang="ts">
export const authForms = {
    CREDENTIALS: 'CREDENTIALS',
    BUILDER_ID_CODE_WHISPERER: 'BUILDER_ID_CODE_WHISPERER',
    BUILDER_ID_CODE_CATALYST: 'BUILDER_ID_CODE_CATALYST',
    IDENTITY_CENTER_CODE_WHISPERER: 'IDENTITY_CENTER_CODE_WHISPERER',
} as const

export type AuthFormId = (typeof authForms)[keyof typeof authForms]

export default authForms
</script>
