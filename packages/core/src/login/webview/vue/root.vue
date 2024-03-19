<!-- This Vue File is a template for AWS Toolkit Login, configure app to TOOLKIT if for toolkit login
configure app to AMAZONQ if for Amazon Q login
-->
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
<style></style>
