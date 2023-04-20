<template>
    <div class="flex-container" style="display: flex">
        <div id="left-column">
            <div>
                <h1>Select a feature to get started</h1>
                <div v-for="itemId in unlockedItemIds">
                    <ServiceItem
                        :title="getServiceItemProps(itemId).title"
                        :description="getServiceItemProps(itemId).description"
                        :status="'UNLOCKED'"
                        :isSelected="isServiceSelected(itemId)"
                        :id="itemId"
                        :key="buildServiceItemKey(itemId, 'UNLOCKED')"
                        @service-item-clicked="serviceWasSelected(itemId)"
                    >
                    </ServiceItem>
                </div>
            </div>

            <div>
                <h3>UNLOCK ADDITIONAL FEATURES</h3>
                <div>Some features have additional authentication requirements to use. <a>Read more.</a></div>

                <div v-for="itemId in lockedItemIds">
                    <ServiceItem
                        :title="getServiceItemProps(itemId).title"
                        :description="getServiceItemProps(itemId).description"
                        :status="'LOCKED'"
                        :isSelected="isServiceSelected(itemId)"
                        :id="itemId"
                        :key="buildServiceItemKey(itemId, 'LOCKED')"
                        @service-item-clicked="serviceWasSelected(itemId)"
                    >
                    </ServiceItem>
                </div>
            </div>
            <h3></h3>
        </div>
        <div id="right-column"></div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import ServiceItem, { ServiceItemsState, ServiceItemId, ServiceStatus, StaticServiceItemProps } from './ServiceItem.vue'

const serviceItemsState = new ServiceItemsState()

export default defineComponent({
    components: { ServiceItem },
    name: 'AuthRoot',
    data() {
        return {
            unlockedItemIds: [] as ServiceItemId[],
            lockedItemIds: [] as ServiceItemId[],
        }
    },
    created() {
        this.renderItems()
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
    },
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
    box-sizing: border-box;
    margin: 10px;
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
