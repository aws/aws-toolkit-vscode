<template>
    <div>
        <p :style="{ maxWidth: '95%', marginTop: '0' }">
            A tag is an identifier in the form of a key and value thatt you assign to an AWS resource. You can use tags
            to search and filter your resources or track your AWS costs. Labels are tags with no values that are used to
            identify your environment.
        </p>
        <div class="tags-container" v-for="(tag, index) in tags" :key="index">
            <div class="tag-grid">
                <div class="input-grid-container">
                    <label class="label-context soft" v-if="index === 0">Key</label>
                    <div v-else style="height: 1px"></div>
                    <input
                        v-model="tag.key"
                        class="label-input"
                        type="text"
                        :id="`tag-key-input-${index}`"
                        :data-invalid="tag.keyError !== undefined"
                        @keyup="validateTag(index)"
                        @keydown="updateMap(index)"
                    />
                    <p class="input-validation tag-error-offset" v-if="tag.keyError !== undefined">
                        {{ tag.keyError }}
                    </p>
                    <div v-if="tag.keyError === undefined" style="height: 1px"></div>
                </div>
                <div class="input-grid-container">
                    <label class="label-context soft" v-if="index === 0">Value - optional</label>
                    <div v-else style="height: 1px"></div>
                    <input
                        v-model="tag.value"
                        class="label-input"
                        type="text"
                        :id="`tag-value-input-${index}`"
                        :data-invalid="tag.valueError !== undefined"
                        @keyup="validateTag(index)"
                    />
                    <p class="input-validation tag-error-offset" v-if="tag.valueError !== undefined">
                        {{ tag.valueError }}
                    </p>
                    <div v-else style="height: 1px"></div>
                </div>

                <button
                    style="grid-column: 3; grid-row: 2"
                    class="remove-label"
                    type="button"
                    aria-label="Remove Tag"
                    @click="removeTag(index)"
                ></button>
            </div>
        </div>
        <button
            id="add-label"
            class="button-theme-secondary"
            type="button"
            @click="addTag()"
            v-show="tags.length < maxTags"
        >
            Add new
        </button>
        <label style="pointer-events: none" class="label-context soft" for="add-label" v-show="tags.length < maxTags"
            >You can add up to {{ maxTags - tags.length }} more.</label
        >

        <p id="tag-label-container">
            Preview labels:
            <span v-for="tag in labels" class="tag-label badge">{{ tag.key }}</span>
            <span id="no-labels" class="tag-label badge" v-show="labels.length === 0">No labels</span>
        </p>
        <p class="no-spacing soft">Labels will identify your environment</p>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

const MAX_TAGS = 50
const MAX_KEY_LENGTH = 128
const MAX_VALUE_LENGTH = 256
const INVALID_CHARACTER_REGEX = /[^a-zA-Z0-9\s_.:/=+-@]/g

export interface TagWithErrors {
    key: string
    value: string
    keyError?: string
    valueError?: string
}

class VueModel {
    public tags!: TagWithErrors[]
}

function matchInvalid(s: string, regex: RegExp): string | undefined {
    const matches = s.match(regex)
    if (!matches || matches.length === 0) {
        return
    }

    return `Invalid characters: ${Array.from(new Set(matches)).join('')}`
}

// TODO: share these somehow (probably just build them into both packs)
function validateKey(key: string, tagMap: Map<string, Set<TagWithErrors>>): string | undefined {
    if (!key) {
        return 'Key cannot be empty'
    }
    if (key.length > MAX_KEY_LENGTH) {
        return `Key cannot be larger than ${MAX_KEY_LENGTH} characters`
    }
    if (key.startsWith('aws:')) {
        return "Key cannot start with 'aws:'"
    }
    if (tagMap.get(key) !== undefined && tagMap.get(key)!.size > 1) {
        return `Key name "${key}" already exists`
    }
    return matchInvalid(key, INVALID_CHARACTER_REGEX)
}

function validateValue(value: string): string | undefined {
    if (value.length > MAX_VALUE_LENGTH) {
        return `Value cannot be larger than ${MAX_VALUE_LENGTH} characters`
    }
    return matchInvalid(value, INVALID_CHARACTER_REGEX)
}

export default defineComponent({
    name: 'tags-panel',
    props: {
        modelValue: VueModel,
    },
    data() {
        return {
            tags: this.modelValue?.tags ?? [],
            tagSet: new Map<string, Set<TagWithErrors>>(),
            maxTags: MAX_TAGS,
        }
    },
    methods: {
        update(key: string, value: any) {
            this.$emit('update:modelValue', { ...this.modelValue, [key]: value })
        },
        removeTag(index: number) {
            this.updateMap(index)
            this.tags.splice(index, 1)
            this.update('tags', this.tags)
        },
        addTag() {
            const key = `new-label-${this.tags.length + 1}`
            this.tags.push({ key, value: '' })
            this.validateTag(this.tags.length - 1)
            this.update('tags', this.tags)
        },
        updateMap(index: number) {
            const tag = this.tags[index]
            const set = this.tagSet.get(tag.key)
            if (!set) {
                return
            }
            // TODO: just use unique IDs generated per tag...
            set.delete(tag)
            if (set.size === 1) {
                const first = Array.from(set.values()).pop()!
                first.keyError = validateKey(first.key, this.tagSet)
            }
        },
        validateTag(index: number) {
            const tag = this.tags[index]
            this.tagSet.set(tag.key, (this.tagSet.get(tag.key) ?? new Set()).add(tag))
            tag.keyError = validateKey(tag.key, this.tagSet)
            tag.valueError = validateValue(tag.value)
            this.update('tags', this.tags)
        },
    },
    computed: {
        labels() {
            return this.tags.filter(t => t.value === '' && t.key !== '')
        },
    },
})
</script>

<style>
.inline-block {
    display: inline-block;
}
.label-input {
    margin: 0 8px 8px 0;
}
.remove-label {
    width: 32px;
    height: 23px; /* 1px border */
    border: transparent;
    margin: 0 0 0 -8px;
    padding: 0;
    background: transparent;
    background-size: 20px;
    background-repeat: no-repeat;
    background-position: center;
}
#add-label {
    margin: 0px 0px 8px 0;
    padding: 8px 16px;
}
body.vscode-dark .remove-label {
    background-image: url('/resources/dark/exit.svg');
}
body.vscode-light .remove-label {
    background-image: url('/resources/light/exit.svg');
}
.tag-label {
    display: inline-block;
    margin: 4px 4px;
}
#no-labels {
    background: #505050;
}
.tag-grid {
    display: grid;
    grid-template-columns: 45% 45% auto;
    grid-template-rows: auto auto auto;
    grid-auto-flow: column;
}
.input-grid-container {
    display: contents;
}
.tags-container {
    max-width: max(731px, 80%);
}
.tag-error-offset {
    margin: -8px 8px 8px 0;
}
</style>
