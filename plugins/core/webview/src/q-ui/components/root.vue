<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<template>
    <div>
        <!-- Body -->
        <div class="body">
            <Logo
                :app="app"
                :is-connected="stage === 'CONNECTED'"
            />
            <!-- Functionality -->
            <Reauth v-if="stage === 'REAUTH'" :app="app"/>
            <Login v-else :app="app"></Login>

        </div>
    </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import Login from './login.vue'
import Reauth from "@/q-ui/components/reauth.vue";
import {Stage} from "../..//model";
import Logo from "@/q-ui/components/logo.vue";
export default defineComponent({
    name: 'auth',
    components: {
        Logo,
        Reauth,
        Login,
    },
    props: {
        app: String
    },
    computed: {
        stage(): Stage {
            return this.$store.state.stage
        }
    },
    data() {
        return {}
    },
    mounted() {
        window.changeTheme = this.changeTheme.bind(this)
        window.ideApi.postMessage({command: 'prepareUi'})
    },
    methods: {
        changeTheme(darkMode: boolean) {
            const oldCssId = darkMode ? "jb-light" : "jb-dark"
            const newCssId = darkMode ? "jb-dark" : "jb-light"
            document.body.classList.add(newCssId);
            document.body.classList.remove(oldCssId);
        },
    },
})
</script>
<style>
.body {
    margin: 0 10px;
}
</style>
