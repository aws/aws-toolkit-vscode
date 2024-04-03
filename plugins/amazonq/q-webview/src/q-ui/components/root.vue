<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<template>
    <div>
        <!-- Body -->
        <div class="body">
            <!-- Functionality -->
            <Login :disabled="false" :app="'AMAZONQ'"></Login>
        </div>
    </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import Login from './login.vue'
export default defineComponent({
    name: 'auth',
    components: {
        Login,
    },
    data() {
        return {}
    },
    mounted() {},
    methods: {},
})
</script>
<style>
.body {
    margin: 0 10px;
}
</style>
