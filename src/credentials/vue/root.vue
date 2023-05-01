<template>
    <div class="flex-container">
        <div id="left-column">
            <div>
                <h1>Select a feature to get started</h1>
                <ul class="service-item-list" v-for="itemId in unlockedItemIds">
                    <ServiceItem
                        :title="getServiceItemProps(itemId).title"
                        :description="getServiceItemProps(itemId).description"
                        :status="'UNLOCKED'"
                        :isSelected="isServiceSelected(itemId)"
                        :isLandscape="isLandscape"
                        :id="itemId"
                        :key="buildServiceItemKey(itemId, 'UNLOCKED')"
                        @service-item-clicked="serviceWasSelected(itemId)"
                    >
                        <template v-slot:service-item-content-slot v-if="isServiceSelected(itemId) && !isLandscape">
                            <component :is="getServiceItemContent(itemId)" :key="itemId"></component>
                        </template>
                    </ServiceItem>
                </ul>
            </div>

            <div>
                <h3>UNLOCK ADDITIONAL FEATURES</h3>
                <div>Some features have additional authentication requirements to use. <a>Read more.</a></div>

                <ul class="service-item-list" v-for="itemId in lockedItemIds">
                    <ServiceItem
                        :title="getServiceItemProps(itemId).title"
                        :description="getServiceItemProps(itemId).description"
                        :status="'LOCKED'"
                        :isSelected="isServiceSelected(itemId)"
                        :isLandscape="isLandscape"
                        :id="itemId"
                        :key="buildServiceItemKey(itemId, 'LOCKED')"
                        @service-item-clicked="serviceWasSelected(itemId)"
                    >
                        <template v-slot:service-item-content-slot v-if="isServiceSelected(itemId) && !isLandscape">
                            <component :is="getServiceItemContent(itemId)" :key="itemId"></component>
                        </template>
                    </ServiceItem>
                </ul>
            </div>
            <h3></h3>
        </div>
        <div v-if="isLandscape && isAnyServiceSelected" id="right-column">
            <component :is="getServiceItemContent(getSelectedService())"></component>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import ServiceItem, { ServiceItemsState, ServiceItemId, ServiceStatus, StaticServiceItemProps } from './ServiceItem.vue'
import AwsExplorerContent from './serviceItemContent/AwsExplorerContent.vue'
import serviceItemsContent from './serviceItemContent/types.vue'

const serviceItemsState = new ServiceItemsState()

export default defineComponent({
    components: { ServiceItem, AwsExplorerContent },
    name: 'AuthRoot',
    data() {
        return {
            unlockedItemIds: [] as ServiceItemId[],
            lockedItemIds: [] as ServiceItemId[],
            currWindowWidth: window.innerWidth,
        }
    },
    created() {
        this.renderItems()
    },
    mounted() {
        window.addEventListener('resize', this.updateWindowWidth)
    },
    unmounted() {
        window.removeEventListener('resize', this.updateWindowWidth)
    },
    computed: {
        isLandscape() {
            return this.currWindowWidth > 1300
        },
        isAnyServiceSelected(): boolean {
            return serviceItemsState.selected !== undefined
        },
    },
    methods: {
        /**
         * Triggers a rendering of the service items.
         */
        renderItems() {
            const { unlocked, locked } = serviceItemsState.getServiceIds()
            this.unlockedItemIds = unlocked
            this.lockedItemIds = locked
        },
        isServiceSelected(id: ServiceItemId): boolean {
            return serviceItemsState.selected === id
        },
        getSelectedService(): ServiceItemId {
            return serviceItemsState.selected!
        },
        getServiceItemProps(id: ServiceItemId): StaticServiceItemProps {
            return serviceItemsState.getStaticServiceItemProps(id)
        },
        serviceWasSelected(id: ServiceItemId): void {
            serviceItemsState.select(id)
            this.renderItems()
        },
        /**
         * Builds a unique key for a service item to optimize re-rendering.
         *
         * This allows Vue to know which existing component to compare to the new one.
         * https://vuejs.org/api/built-in-special-attributes.html#key
         */
        buildServiceItemKey(id: ServiceItemId, lockStatus: ServiceStatus) {
            return id + '_' + (this.isServiceSelected(id) ? `${lockStatus}_SELECTED` : `${lockStatus}`)
        },
        updateWindowWidth() {
            this.currWindowWidth = window.innerWidth
        },
        getServiceItemContent(id: ServiceItemId) {
            return serviceItemsContent[id]
        },
    },
})
</script>

<style>
/** By default  */
.flex-container {
    display: flex;
    flex-direction: row;
}

#left-column {
    width: 500px;
    box-sizing: border-box;
    margin: 10px;
}

.service-item-list {
    list-style-type: none;
    margin: 0;
    padding: 0;
}

.service-item-list li {
    /* Creates an even separation between all list items*/
    margin-top: 10px;
}

#right-column {
    /* This can be deleted, for development purposes */
    height: 800px;
    margin: 10px;
}
</style>
