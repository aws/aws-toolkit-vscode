<template>
    <div id="service-item-content-container">TODO</div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'

export const ServiceItemContent = defineComponent({})

export default ServiceItemContent
</script>
<style>
#service-item-content-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    border-style: solid;
    border-width: 2px;
    border-radius: 4px;
    border-color: #0097fb;

    width: 700px;
    height: 100%;

    /* For testing purposes, before we have content to fill */
    min-height: 600px;
}
</style>
