<script setup lang="ts">
import '../../../shared/ux/styles.css'
import TkFixedLayout from '../../../shared/ux/tkFixedLayout.vue'
import CreateSchedulePage from './views/createSchedulePage.vue'
</script>

<template>
    <tk-fixed-layout :width="628">
        <create-schedule-page />
    </tk-fixed-layout>
</template>
