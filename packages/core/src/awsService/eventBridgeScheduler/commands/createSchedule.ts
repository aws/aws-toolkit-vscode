/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../../shared/logger/logger'
import { EventBridgeSchedulerService, ScheduleConfig } from '../eventBridgeSchedulerService'
import { showQuickPick, showInputBox } from '../../../shared/ui/pickerPrompter'
import { createQuickStartUrl } from '../../../shared/utilities/workspaceUtils'

/**
 * Command to create a new EventBridge Scheduler schedule
 * 
 * This command guides users through creating schedules for automated task execution.
 * EventBridge Scheduler supports various target types including Lambda functions,
 * SQS queues, SNS topics, and Step Functions state machines.
 * 
 * Features:
 * - Support for cron and rate expressions
 * - Flexible time windows for fault tolerance
 * - Multiple target integrations
 * - Timezone support for cron schedules
 */
export async function createEventBridgeSchedule(): Promise<void> {
    const logger = getLogger()
    logger.info('Starting EventBridge Scheduler create schedule workflow')

    try {
        const schedulerService = new EventBridgeSchedulerService()
        
        // Get schedule name
        const scheduleName = await showInputBox({
            title: 'Schedule Name',
            placeholder: 'my-daily-backup-schedule',
            validateInput: (input) => {
                if (!input || input.trim().length === 0) {
                    return 'Schedule name is required'
                }
                if (input.length > 64) {
                    return 'Schedule name must be 64 characters or fewer'
                }
                if (!/^[a-zA-Z0-9\-_]+$/.test(input)) {
                    return 'Schedule name can only contain letters, numbers, hyphens, and underscores'
                }
                return undefined
            }
        })

        if (!scheduleName) {
            return
        }

        // Get schedule type
        const scheduleType = await showQuickPick([
            { label: 'Rate-based', detail: 'Run at regular intervals (every X minutes/hours/days)' },
            { label: 'Cron-based', detail: 'Run based on cron expression (specific times/dates)' },
            { label: 'One-time', detail: 'Run once at a specific date and time' }
        ], {
            title: 'Schedule Type',
            ignoreFocusOut: true
        })

        if (!scheduleType) {
            return
        }

        // Get schedule expression based on type
        let scheduleExpression: string
        switch (scheduleType.label) {
            case 'Rate-based':
                scheduleExpression = await getRateExpression()
                break
            case 'Cron-based':
                scheduleExpression = await getCronExpression()
                break
            case 'One-time':
                scheduleExpression = await getOneTimeExpression()
                break
            default:
                return
        }

        if (!scheduleExpression) {
            return
        }

        // Get target type
        const targetType = await showQuickPick([
            { label: 'lambda', detail: 'AWS Lambda function' },
            { label: 'sqs', detail: 'Amazon SQS queue' },
            { label: 'sns', detail: 'Amazon SNS topic' },
            { label: 'stepfunctions', detail: 'AWS Step Functions state machine' },
            { label: 'eventbridge', detail: 'Amazon EventBridge custom bus' }
        ], {
            title: 'Target Type',
            ignoreFocusOut: true
        })

        if (!targetType) {
            return
        }

        // For now, show a placeholder message
        await vscode.window.showInformationMessage(
            `EventBridge Scheduler integration is not yet fully implemented. ` +
            `Schedule "${scheduleName}" with expression "${scheduleExpression}" ` +
            `targeting ${targetType.label} would be created.`,
            'View Documentation'
        ).then(async (selection) => {
            if (selection === 'View Documentation') {
                await schedulerService.openScheduleTypesDocumentation()
            }
        })

    } catch (error) {
        logger.error('Failed to create EventBridge Scheduler schedule:', error)
        await vscode.window.showErrorMessage(`Failed to create schedule: ${error}`)
    }
}

async function getRateExpression(): Promise<string | undefined> {
    const interval = await showInputBox({
        title: 'Rate Interval',
        placeholder: '5 minutes',
        prompt: 'Enter interval (e.g., "5 minutes", "1 hour", "2 days")',
        validateInput: (input) => {
            if (!input || !/^\d+\s+(minute|minutes|hour|hours|day|days)$/.test(input.trim())) {
                return 'Please enter a valid interval (e.g., "5 minutes", "1 hour", "2 days")'
            }
            return undefined
        }
    })
    
    return interval ? `rate(${interval})` : undefined
}

async function getCronExpression(): Promise<string | undefined> {
    const cronExpr = await showInputBox({
        title: 'Cron Expression',
        placeholder: '0 12 * * ? *',
        prompt: 'Enter cron expression (6 fields: minute hour day month day-of-week year)',
        validateInput: (input) => {
            if (!input || input.trim().split(/\s+/).length !== 6) {
                return 'Cron expression must have exactly 6 fields'
            }
            return undefined
        }
    })
    
    return cronExpr ? `cron(${cronExpr})` : undefined
}

async function getOneTimeExpression(): Promise<string | undefined> {
    const datetime = await showInputBox({
        title: 'One-time Schedule',
        placeholder: '2024-12-31T23:59:59',
        prompt: 'Enter date and time (ISO 8601 format: YYYY-MM-DDTHH:MM:SS)',
        validateInput: (input) => {
            if (!input || !input.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)) {
                return 'Please enter date in ISO 8601 format (YYYY-MM-DDTHH:MM:SS)'
            }
            return undefined
        }
    })
    
    return datetime ? `at(${datetime})` : undefined
}
