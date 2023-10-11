<!-- This Vue File provides Header and body of Getting Started Page of CodeWhisperer-->
<template>
    <div>
        <!-- Header -->
        <div class="headerDiv">
            <!-- Banner -->
            <div v-if="active === 0 && bannerVisible" class="banner">
                <div class="bannerDiv">
                    <div class="infoIcon">
                        <svg width="15" height="16" viewBox="0 0 15 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M8.58667 1.01333C9.36889 1.12 10.1156 1.35111 10.8267 1.70667C11.5733 2.02667 12.2133 2.47111 12.7467 3.04C13.6 3.89333 14.1867 4.87111 14.5067 5.97333C14.8267 7.07556 14.88 8.19556 14.6667 9.33333C14.4533 10.4711 13.9733 11.5022 13.2267 12.4267C12.5511 13.28 11.7156 13.9378 10.72 14.4C9.76 14.8267 8.74667 15.0222 7.68 14.9867C6.61333 14.9511 5.6 14.6844 4.64 14.1867C3.92889 13.7956 3.30667 13.2978 2.77333 12.6933C2.24 12.0889 1.81333 11.4133 1.49333 10.6667C1.20889 9.92 1.04889 9.15556 1.01333 8.37333C0.977778 7.55556 1.06667 6.75556 1.28 5.97333C1.52889 5.19111 1.88444 4.48 2.34667 3.84C2.80889 3.2 3.37778 2.64889 4.05333 2.18667C4.72889 1.72444 5.44 1.40444 6.18667 1.22667C6.96889 1.01333 7.76889 0.942222 8.58667 1.01333ZM9.06667 13.8667C9.70667 13.7244 10.3111 13.4756 10.88 13.12C11.4844 12.7644 12 12.32 12.4267 11.7867C13.0667 11.0044 13.4756 10.1333 13.6533 9.17333C13.8667 8.17778 13.8311 7.21778 13.5467 6.29333C13.2622 5.33333 12.7644 4.48 12.0533 3.73333C11.4133 3.09333 10.6489 2.63111 9.76 2.34667C8.90667 2.02667 8.01778 1.93778 7.09333 2.08C6.20444 2.18667 5.38667 2.48889 4.64 2.98667C3.75111 3.59111 3.07556 4.37333 2.61333 5.33333C2.15111 6.25778 1.93778 7.25333 1.97333 8.32C2.04444 9.35111 2.34667 10.3111 2.88 11.2C3.44889 12.0889 4.19556 12.7822 5.12 13.28C5.72444 13.6 6.36444 13.8133 7.04 13.92C7.71556 14.0267 8.37333 14.0089 9.01333 13.8667H9.06667ZM7.36 5.97333H8.64V5.01333H7.36V5.97333ZM8.64 6.98667V10.9867H7.36V6.98667H8.64Z"
                                fill="#C5C5C5"
                            />
                        </svg>
                    </div>
                    <div class="bannerDescription">
                        You can always return to this page by clicking “Learn” in Developer Tools > CodeWhisperer
                    </div>
                </div>
                <div v-on:click="closeStatusBar" class="icon icon-lg icon-vscode-chrome-close closeBanner"></div>
            </div>
            <!-- Logo + Title -->
            <div class="logoIcon">
                <!-- Icon -->
                <svg width="54" height="54" viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                        fill-rule="evenodd"
                        clip-rule="evenodd"
                        d="M27.7667 29.1198L29.5872 29.751L25.5655 41.344L23.7449 40.7127L27.7667 29.1198ZM22.1624 32.1488L19.2018 35.1346L22.1037 38.1145L20.7216 39.4599L17.1606 35.8015C16.7943 35.4246 16.7972 34.8233 17.1673 34.4503L20.7939 30.7919L22.1624 32.1488ZM36.4828 34.4503C36.8529 34.8233 36.8558 35.4246 36.4896 35.8015L32.9266 39.4599L31.5455 38.1145L34.4474 35.1346L31.4877 32.1488L32.8562 30.7919L36.4828 34.4503ZM43.3987 38.3718L40.0757 40.0323C39.75 40.1962 39.5437 40.5296 39.5437 40.8949V46.6369L31.72 51.4518L27.9787 49.3152V44.3326H26.0512V49.3152L22.3099 51.4518L14.4862 46.6369V40.8939C14.4862 40.5287 14.2799 40.1952 13.9532 40.0323L10.6312 38.3708L10.6302 34.618L10.6312 30.4064L14.1064 27.758C14.3455 27.5758 14.4862 27.2925 14.4862 26.9918V21.6372L21.6507 17.4584L26.0512 19.915V26.0213H27.9787V19.915L32.3782 17.4584L39.5437 21.6372V26.9918C39.5437 27.2925 39.6835 27.5758 39.9225 27.758L43.3987 30.4054L43.3997 34.618L43.3987 38.3718ZM44.9465 29.1622L41.4712 26.5138V21.084C41.4712 20.7419 41.2891 20.4248 40.9932 20.2513L32.8745 15.5164C32.5796 15.3439 32.2153 15.341 31.9195 15.5068L27.0149 18.2458L22.1104 15.5068C21.8126 15.342 21.4493 15.3439 21.1553 15.5164L13.0367 20.2513C12.7398 20.4248 12.5587 20.7419 12.5587 21.084V26.5147L9.0824 29.1622C8.84339 29.3443 8.70365 29.6286 8.70365 29.9293L8.70268 34.618L8.70365 38.9664C8.70365 39.3317 8.90989 39.6651 9.23564 39.829L12.5587 41.4895V47.1757C12.5587 47.5101 12.7312 47.8204 13.0164 47.9958L21.7866 53.3938C22.0863 53.5769 22.4622 53.5837 22.7696 53.4092L27.0149 50.9844L31.2593 53.4092C31.4077 53.494 31.5725 53.5364 31.7373 53.5364C31.9127 53.5364 32.0872 53.4882 32.2433 53.3938L41.0125 47.9958C41.2977 47.8204 41.4712 47.5101 41.4712 47.1757V41.4905L44.7933 39.829C45.12 39.6661 45.3262 39.3327 45.3262 38.9674L45.3272 34.618L45.3262 29.9284C45.3262 29.6277 45.1855 29.3443 44.9465 29.1622ZM17.3774 5.30064C17.3774 6.09862 16.7298 6.74627 15.9318 6.74627C15.1328 6.74627 14.4862 6.09862 14.4862 5.30064C14.4862 4.50169 15.1328 3.85501 15.9318 3.85501C16.7298 3.85501 17.3774 4.50169 17.3774 5.30064ZM12.5587 5.30064C12.5587 6.09862 11.911 6.74627 11.113 6.74627C10.3141 6.74627 9.6674 6.09862 9.6674 5.30064C9.6674 4.50169 10.3141 3.85501 11.113 3.85501C11.911 3.85501 12.5587 4.50169 12.5587 5.30064ZM7.7399 5.30064C7.7399 6.09862 7.09225 6.74627 6.29427 6.74627C5.49532 6.74627 4.84864 6.09862 4.84864 5.30064C4.84864 4.50169 5.49532 3.85501 6.29427 3.85501C7.09225 3.85501 7.7399 4.50169 7.7399 5.30064ZM1.95738 8.67377L1.9622 2.01713C1.9622 1.97473 2.01232 1.9275 2.08363 1.9275H51.9511C52.0224 1.9275 52.0725 1.97473 52.0725 2.01713V8.67377H1.95738ZM51.9511 0H2.07881C0.951225 0 0.0318052 0.904 0.0298777 2.01521L7.60558e-07 37.4938C-0.00096223 38.6002 0.912675 39.5061 2.04316 39.5138L5.81239 39.5119V37.5863L2.07689 37.5873C2.00653 37.5873 1.95738 37.5401 1.95738 37.4977L1.97955 10.6013H52.0725V37.4871C52.0725 37.5401 52.0166 37.5854 51.9511 37.5854L48.2175 37.5863V39.5138L51.9511 39.5129C53.0806 39.5129 54 38.6041 54 37.4871V2.01713C54 0.904963 53.0806 0 51.9511 0Z"
                        fill="url(#paint0_linear_227_4962)"
                    />
                    <defs>
                        <linearGradient
                            id="paint0_linear_227_4962"
                            x1="53.5957"
                            y1="-883.34"
                            x2="19.5336"
                            y2="-883.327"
                            gradientUnits="userSpaceOnUse"
                        >
                            <stop stop-color="#6EB1FF" />
                            <stop offset="1" stop-color="#DA8AF7" />
                        </linearGradient>
                    </defs>
                </svg>
                <!-- Text -->
                <div class="titleDiv">
                    <div class="titleHeader">Amazon CodeWhisperer</div>
                    <div class="titleSubHeader">Your AI coding companion</div>
                </div>
            </div>
        </div>
        <!-- Body -->
        <div class="body">
            <!-- Additional Resources-->
            <div class="resources">
                <Shortcuts />
                <Workshop />
                <Resources />
            </div>
            <!-- Functionality -->
            <div class="bodySubDiv">
                <GenerateSuggestionTab />
                <!-- Break Line -->
                <div class="breakLine">
                    <svg width="100%" height="2" viewBox="0 0 744 2" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M0 1H744" stroke="#2F2F2F" />
                    </svg>
                </div>
                <ScanCode />
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import Resources from './resources.vue'
import Shortcuts from './shortcuts.vue'
import ScanCode from './scanCode.vue'
import GenerateSuggestionTab from './genSuggestionTab.vue'
import Workshop from './workshop.vue'

export default defineComponent({
    name: 'Getting_Started',
    components: {
        Resources,
        Shortcuts,
        ScanCode,
        GenerateSuggestionTab,
        Workshop,
    },
    data() {
        return {
            bannerVisible: true,
            active: parseInt(sessionStorage.getItem('active') || '0'),
        }
    },
    mounted() {
        /* 
                We use Session Storage here because we need to store the the first time signin user and Existing first time signin state globally. According to this we need to display the banner.
                This can be done by storing the state. We can not use local state for this. 
                Default the value of Key: Active is 0 after the DOM is mounted it is updated to 1.
            */
        sessionStorage.setItem('active', '1')
    },
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
    justify-content: center;
    gap: 5%;
    justify-items: center;
}
.bodySubDiv {
    display: flex;
    flex-direction: column;
    width: 720px;
    height: auto;
    justify-items: start;
    align-items: start;
}
.breakLine {
    display: flex;
    width: 100%;
    background: #2f2f2f;
}
.resources {
    width: 290px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    justify-content: start;
    align-items: start;
}
</style>
