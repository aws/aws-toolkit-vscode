<!-- This Vue File provides Header and body of Getting Started Page of CodeWhisperer-->
<template>
    <div>
        <!-- Body -->
        <div class="body">
            <!-- Functionality -->
            <Login :disabled="false"></Login>
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
        return {
            bannerVisible: true,
            active: parseInt(sessionStorage.getItem('active') || '0'),
        }
    },
    mounted() {},
    methods: {
        //Triggered only for the first time
        closeStatusBar() {
            this.bannerVisible = false
        },
    },
})
</script>
<style>
.headerDiv {
    display: flex;
    flex-direction: column;
}

.banner {
    padding-left: 30px;
    padding-right: 30px;
    background-color: #0a4265;
    border-radius: 10px;
    display: flex;
    height: 48px;
    align-items: center;
    /* border: 1px solid #f5f5f5; */
}
.bannerDiv {
    display: flex;
    flex-direction: row;
    flex: 0.95;
    align-items: center;
    justify-content: left;
    gap: 20px;
}
.infoIcon {
    margin-top: 3px;
    justify-content: left;
}
.bannerDescription {
    color: #f5f5f5;
    font-family: Verdana;
    font-size: 14px;
    font-weight: 350;
    text-align: left;
    justify-content: left;
}
.closeBanner {
    cursor: pointer;
    color: #ffffff;
    align-items: center;
    flex: 0.05;
    text-align: right;
    padding-top: 5px;
}
.logoIcon {
    display: flex;
    flex-direction: row;
    justify-content: left;
    align-items: center;
    padding-top: 25px;
    padding-bottom: 30px;
    padding-left: 60px;
    height: auto;
}
.titleDiv {
    display: flex;
    flex-direction: column;
    padding-left: 20px;
    padding-top: 10px;
    padding-bottom: 10px;
}
.titleHeader {
    font-family: Verdana;
    font-size: 24px;
    font-weight: 860;
    line-height: 12px;
    letter-spacing: 0em;
    text-align: left;
}
.titleSubHeader {
    font-family: Verdana;
    font-size: 14px;
    font-weight: 400;
    padding-top: 10px;
    line-height: 21px;
    letter-spacing: 0em;
    text-align: left;
}
.body {
    display: flex;
    flex-wrap: wrap-reverse;
    height: auto;
    justify-content: left;
    gap: 5%;
    justify-items: left;
    padding-left: 60px;
}
.bodySubDiv {
    display: flex;
    flex-direction: column;
    width: 860;
    height: auto;
    justify-items: start;
    align-items: start;
}
</style>
