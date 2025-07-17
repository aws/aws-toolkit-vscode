<script setup lang="ts">
import { reactive, watch } from 'vue'
import TkSpaceBetween from '../../../../shared/ux/tkSpaceBetween.vue'
import TkRadioField from '../../../../shared/ux/tkRadioField.vue'
import TkSelectField, { Option } from '../../../../shared/ux/tkSelectField.vue'
import TkInputField from '../../../../shared/ux/tkInputField.vue'

interface State {
    scheduleType: string
    intervalType: string
    hour: number
    time: string
    dayOfWeek: string
    timeOfWeek: string
    timeOfWeekday: string
    dayOfMonth: number
    timeOfMonth: string
    cronExpression: string
    hourErrorMessage: string
    timeErrorMessage: string
    timeOfWeekErrorMessage: string
    timeOfWeekdayErrorMessage: string
    dayOfMonthErrorMessage: string
    timeOfMonthErrorMessage: string
    cronExpressionErrorMessage: string
}

const state: State = reactive({
    scheduleType: 'runnow',
    intervalType: 'minute',
    hour: 0,
    time: '00:00',
    dayOfWeek: 'monday',
    timeOfWeek: '00:00',
    timeOfWeekday: '00:00',
    dayOfMonth: 1,
    timeOfMonth: '00:00',
    cronExpression: '0 0 * * MON-FRI',
    hourErrorMessage: '',
    timeErrorMessage: '',
    timeOfWeekErrorMessage: '',
    timeOfWeekdayErrorMessage: '',
    dayOfMonthErrorMessage: '',
    timeOfMonthErrorMessage: '',
    cronExpressionErrorMessage: '',
})

export interface ScheduleChange extends State {}

const emit = defineEmits<{
    (e: 'schedule-change', payload: ScheduleChange): void
}>()

const globalTimeErrorMessage = 'Time must be in hh:mm format'
const timeString1 = 'Specify time in UTC (add 7 hours to local time)'
const timeString2 = 'Schedules in UTC are affected by daylight saving time or summer time changes'

const intervalTypeList: Option[] = [
    { text: 'Minute', value: 'minute' },
    { text: 'Hour', value: 'hour' },
    { text: 'Day', value: 'day' },
    { text: 'Week', value: 'week' },
    { text: 'Weekday', value: 'weekday' },
    { text: 'Month', value: 'month' },
    { text: 'Custom schedule', value: 'custom' },
]

const daysList: Option[] = [
    { text: 'Monday', value: 'monday' },
    { text: 'Tuesday', value: 'tuesday' },
    { text: 'Wednesday', value: 'wednesday' },
    { text: 'Thursday', value: 'thursday' },
    { text: 'Friday', value: 'friday' },
    { text: 'Saturday', value: 'saturday' },
    { text: 'Sunday', value: 'sunday' },
]

watch(
    () => state,
    (newValue: State, oldValue: State) => {
        emit('schedule-change', { ...newValue })
    },
    { deep: true }
)

const onRunNowUpdate = (newValue: string) => {
    state.scheduleType = newValue
}

const onIntervalTypeUpdate = (newValue: string) => {
    state.intervalType = newValue
}

const onHourUpdate = (newValue: string | number) => {
    state.hour = newValue as number
    state.hourErrorMessage = state.hour >= 0 && state.hour <= 59 ? '' : 'Minute must be between 0 and 59'
}

const onTimeUpdate = (newValue: string | number) => {
    state.time = newValue as string
    state.timeErrorMessage = isValidTime(state.time) ? '' : globalTimeErrorMessage
}

const onTimeOfWeekUpdate = (newValue: string | number) => {
    state.timeOfWeek = newValue as string
    state.timeOfWeekErrorMessage = isValidTime(state.timeOfWeek) ? '' : globalTimeErrorMessage
}

const onTimeOfWeekdayUpdate = (newValue: string | number) => {
    state.timeOfWeekday = newValue as string
    state.timeOfWeekdayErrorMessage = isValidTime(state.timeOfWeekday) ? '' : globalTimeErrorMessage
}

const onTimeOfMonthUpdate = (newValue: string | number) => {
    state.timeOfMonth = newValue as string
    state.timeOfMonthErrorMessage = isValidTime(state.timeOfMonth) ? '' : globalTimeErrorMessage
}

const onDayOfWeekUpdate = (newValue: string) => {
    state.dayOfWeek = newValue
}

const onDayOfMonthUpdate = (newValue: string | number) => {
    state.dayOfMonth = newValue as number
    state.dayOfMonthErrorMessage =
        state.dayOfMonth >= 1 && state.dayOfMonth <= 31 ? '' : 'Day of the month must be between 1 and 31'
}

const onCronExpressionUpdate = (newValue: string | number) => {
    state.cronExpression = newValue as string
    state.cronExpressionErrorMessage =
        state.cronExpression.length > 0 ? '' : 'You must provide a valid cron expression.'
}

/**
 * Verifies given value is in 24 hour time format hh:mm
 * Valid time "09:30", "23:59"
 * Invalid time "24:00", "12:60"
 */
function isValidTime(value: string): boolean {
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/
    return timeRegex.test(value)
}
</script>

<template>
    <div class="cron-schedule">
        <tk-space-between>
            <tk-space-between size="xs">
                <tk-radio-field
                    id="runNow"
                    label="Run now"
                    value="runnow"
                    :selected-value="state.scheduleType"
                    @update:value="onRunNowUpdate"
                />

                <tk-radio-field
                    id="runonschedule"
                    label="Run on schedule"
                    value="runonschedule"
                    :selected-value="state.scheduleType"
                    @update:value="onRunNowUpdate"
                />
            </tk-space-between>

            <tk-space-between v-if="state.scheduleType === 'runonschedule'" size="xl">
                <tk-select-field label="Interval" :options="intervalTypeList" @update:value="onIntervalTypeUpdate" />

                <tk-input-field
                    v-if="state.intervalType === 'hour'"
                    type="number"
                    label="Minutes past the hour"
                    :value="state.hour"
                    :validation-message="state.hourErrorMessage"
                    @update:value="onHourUpdate"
                />

                <tk-space-between v-if="state.intervalType === 'day'" size="xs">
                    <tk-input-field
                        label="Time"
                        :value="state.time"
                        :validation-message="state.timeErrorMessage"
                        @update:value="onTimeUpdate"
                    />
                    <tk-space-between size="xxs">
                        <div>{{ timeString1 }}</div>
                        <div>{{ timeString2 }}</div>
                    </tk-space-between>
                </tk-space-between>

                <tk-space-between v-if="state.intervalType === 'week'">
                    <tk-select-field label="Day of the week" :options="daysList" @update:value="onDayOfWeekUpdate" />
                    <tk-space-between size="xs">
                        <tk-input-field
                            label="Time"
                            :value="state.timeOfWeek"
                            :validation-message="state.timeOfWeekErrorMessage"
                            @update:value="onTimeOfWeekUpdate"
                        />
                        <tk-space-between size="xxs">
                            <div>{{ timeString1 }}</div>
                            <div>{{ timeString2 }}</div>
                        </tk-space-between>
                    </tk-space-between>
                </tk-space-between>

                <tk-space-between v-if="state.intervalType === 'weekday'" size="xs">
                    <tk-input-field
                        label="Time"
                        :value="state.timeOfWeekday"
                        :validation-message="state.timeOfWeekdayErrorMessage"
                        @update:value="onTimeOfWeekdayUpdate"
                    />
                    <tk-space-between size="xxs">
                        <div>{{ timeString1 }}</div>
                        <div>{{ timeString2 }}</div>
                    </tk-space-between>
                </tk-space-between>

                <tk-space-between v-if="state.intervalType === 'month'">
                    <tk-input-field
                        type="number"
                        label="Day of month"
                        :value="state.dayOfMonth"
                        :validation-message="state.dayOfMonthErrorMessage"
                        @update:value="onDayOfMonthUpdate"
                    />
                    <tk-space-between size="xs">
                        <tk-input-field
                            label="Time"
                            :value="state.timeOfMonth"
                            :validation-message="state.timeOfMonthErrorMessage"
                            @update:value="onTimeOfMonthUpdate"
                        />
                        <tk-space-between size="xxs">
                            <div>{{ timeString1 }}</div>
                            <div>{{ timeString2 }}</div>
                        </tk-space-between>
                    </tk-space-between>
                </tk-space-between>

                <tk-space-between v-if="state.intervalType === 'custom'" size="xs">
                    <tk-input-field
                        label="Cron expression"
                        :value="state.cronExpression"
                        :validation-message="state.cronExpressionErrorMessage"
                        @update:value="onCronExpressionUpdate"
                    />
                    <tk-space-between size="xxs">
                        <div>{{ timeString1 }}</div>
                        <div>{{ timeString2 }}</div>
                    </tk-space-between>
                </tk-space-between>
            </tk-space-between>
        </tk-space-between>
    </div>
</template>

<style scoped></style>
