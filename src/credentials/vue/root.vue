<template>
    <div class="flex-container" style="display: flex">
        <div id="left-column">I am left column</div>
        <div id="right-column">I am right column</div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
    name: 'MyComponent',
})
</script>

<style>
/** By default  */
.flex-container {
    display: flex;
    flex-direction: row;
    width: 1200px;
}

/* Makes webview responsive and changes to single column when necessary */
@media (max-width: 1200px) {
    .flex-container {
        flex-direction: column;

        color: red;
    }
}

#left-column {
    flex-grow: 1;
    max-width: 40%;

    /* This can be deleted, for development purposes */
    background-color: yellow;
    color: black;
    height: 200px;
}

#right-column {
    flex-grow: 1;
    max-width: 60%;

    /* This can be deleted, for development purposes */
    background-color: aqua;
    color: black;
    height: 200px;
}
</style>
