<template>
    <div>
        <p :style="{ maxWidth: '95%', marginTop: '0' }" v-show="type === 'create'">
            A tag is an identifier in the form of a key and value that you assign to an AWS resource. You can use tags
            to search and filter your resources or track your AWS costs. Labels are tags with no values that are used to
            identify your environment.
        </p>
        <div class="tags-container" v-for="(tag, index) in tags" :key="index">
            <div class="tag-grid">
                <div class="display-contents" v-if="!tag.hidden">
                    <div class="display-contents">
                        <label class="label-context soft" v-if="index === 0">Key</label>
                        <div v-else style="height: 1px"></div>
                        <input
                            v-model="tag.key"
                            class="label-input"
                            type="text"
                            :id="`tag-key-input-${index}`"
                            :data-invalid="!!tag.keyError"
                            :disabled="readonly"
                            @keyup="validateTag(index)"
                        />
                        <p class="input-validation tag-error-offset" v-if="tag.keyError">
                            {{ tag.keyError }}
                        </p>
                        <div v-else style="height: 1px"></div>
                    </div>
                    <div class="display-contents">
                        <label class="label-context soft" v-if="index === 0">Value - optional</label>
                        <div v-else style="height: 1px"></div>
                        <input
                            v-model="tag.value"
                            class="label-input"
                            type="text"
                            :id="`tag-value-input-${index}`"
                            :data-invalid="!!tag.valueError"
                            :disabled="readonly"
                            @keyup="validateTag(index)"
                        />
                        <p class="input-validation tag-error-offset" v-if="tag.valueError">
                            {{ tag.valueError }}
                        </p>
                        <div v-else style="height: 1px"></div>
                    </div>

                    <button
                        style="grid-column: 3; grid-row: 2"
                        class="remove-label"
                        type="button"
                        aria-label="Remove Tag"
                        :disabled="readonly"
                        @click="removeTag(index)"
                    ></button>
                </div>
            </div>
        </div>
        <button
            id="add-label"
            class="button-theme-secondary"
            type="button"
            @click="addTag()"
            v-show="tags.length < maxTags && !readonly"
        >
            Add new
        </button>
        <label
            style="pointer-events: none"
            class="label-context soft"
            for="add-label"
            v-show="tags.length < maxTags && !readonly"
            >You can add up to {{ maxTags - tags.length }} more.</label
        >

        <div id="tag-label-container" class="mt-8">
            <span> {{ type === 'create' ? 'Preview labels:' : 'Labels:' }} </span>
            <span v-for="tag in labels" class="tag-label badge">{{ tag.key }}</span>
            <span id="no-labels" class="tag-label badge" v-show="labels.length === 0">No labels</span>
        </div>
        <p class="no-spacing soft" v-show="type === 'create'">Labels identify your environment</p>
    </div>
</template>

<script lang="ts">
import { defineComponent, watchEffect, PropType } from 'vue'
import { createClass, createType } from '../../webviews/util'
import { EnvironmentProp } from './shared'

const MAX_TAGS = 50
const MAX_KEY_LENGTH = 128
const MAX_VALUE_LENGTH = 256
const INVALID_CHARACTER_REGEX = /[^a-zA-Z0-9\s_.:/=+-@]/g
const HIDE_GENERATED_TAGS = true

export interface TagWithErrors {
    key: string
    value: string
    keyError?: string
    valueError?: string
    /**
     * True if this tag was not created by the user.
     * These are hidden by default.
     */
    generated?: boolean
    hidden?: boolean
}

// TODO: add a preview mode?
// for now the config panel will be 1:1 with the create
// they're functionally equivalent, it's just a 'style' thing
export const VueModel = createClass({
    tags: [] as TagWithErrors[],
})

function matchInvalid(s: string, regex: RegExp): string | undefined {
    const matches = s.match(regex)
    if (!matches || matches.length === 0) {
        return
    }

    return `Invalid characters: ${Array.from(new Set(matches)).join('')}`
}

// TODO: share these somehow (probably just build them into both packs)
function validateKey(key: string, tagMap: Set<string>): string | undefined {
    if (!key) {
        return 'Key cannot be empty'
    }
    if (key.length > MAX_KEY_LENGTH) {
        return `Key cannot be larger than ${MAX_KEY_LENGTH} characters`
    }
    if (key.startsWith('aws:')) {
        return "Key cannot start with 'aws:'"
    }
    if (tagMap.has(key)) {
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
        modelValue: {
            type: createType(VueModel),
            default: new VueModel(),
        },
        type: {
            type: String as PropType<'create' | 'configure'>,
            default: 'create',
        },
        maxTags: {
            type: Number,
            default: MAX_TAGS,
        },
        environment: EnvironmentProp,
        readonly: Boolean,
    },
    data() {
        return {}
    },
    methods: {
        update(key: string, value: any) {
            this.$emit('update:modelValue', { ...this.modelValue, [key]: value })
        },
        removeTag(index: number) {
            this.tags.splice(index, 1)
            this.update('tags', this.tags)
        },
        watchTag(tag: TagWithErrors) {
            watchEffect(
                () =>
                    !tag.hidden &&
                    !this.duplicates.has(tag.key) &&
                    (tag.keyError = validateKey(tag.key, this.duplicates))
            )
        },
        addTag() {
            this.tags.push({ key: `new-label-${this.tags.length + 1}`, value: '' })
            this.watchTag(this.tags[this.tags.length - 1])
            this.validateTag(this.tags.length - 1)
            this.update('tags', this.tags)
        },
        validateTag(index: number) {
            const tag = this.tags[index]

            if (tag.hidden) {
                return
            }

            tag.keyError = validateKey(tag.key, this.duplicates)
            tag.valueError = validateValue(tag.value)
            this.update('tags', this.tags)
        },
    },
    computed: {
        tags(): TagWithErrors[] {
            const applyHidden = this.modelValue.tags.map(t => ({ ...t, hidden: t.generated && HIDE_GENERATED_TAGS }))
            applyHidden.forEach(t => this.watchTag(t))
            return applyHidden
        },
        labels() {
            return this.tags.filter(t => t.value === '' && t.key !== '')
        },
        duplicates() {
            const seen = new Set<string>()
            const dupes = new Set<string>()
            // tags can be undefined on init throwing an error
            this.tags?.forEach(({ key }) => (seen.has(key) ? dupes.add(key) : seen.add(key)))
            return dupes
        },
    },
})
</script>

<style scoped>
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
.tags-container {
    max-width: max(731px, 80%);
}
.tag-error-offset {
    margin: -8px 8px 8px 0;
}
</style>
