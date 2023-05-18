<script lang="ts">
export const authForms = {
    CREDENTIALS: 'CREDENTIALS',
} as const

export type AuthFormId = (typeof authForms)[keyof typeof authForms]

export default authForms
</script>
