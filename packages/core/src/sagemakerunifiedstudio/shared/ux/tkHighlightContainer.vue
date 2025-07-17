<script setup>
/**
 * TkHighlightContainer Component
 *
 * A simple wrapper component that provides consistent padding and hover styling for form fields or groups of elements.
 *
 * ### Slots
 * @slot default - The content to be wrapped inside the styled container.
 *
 * ### Example Usage
 * ```vue
 * <tk-highlight-container>
 *   <input type="text" placeholder="Your name" />
 * </tk-highlight-container>
 * ```
 */
</script>

<template>
    <div class="tk-highlight-container">
        <slot />
    </div>
</template>

<style scoped>
.tk-highlight-container {
    padding: 12px 14px 18px 14px;
}

.tk-highlight-container:hover {
    background-color: var(--vscode-settings-rowHoverBackground);
}
</style>
