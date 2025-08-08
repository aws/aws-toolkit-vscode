/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { 
    eventBridgeSchedulerCreateScheduleUrl, 
    eventBridgeSchedulerApiGatewayUrl,
    eventBridgeSchedulerRolePermissionsUrl 
} from '../../shared/constants'

/**
 * Service for managing Amazon EventBridge Scheduler schedules
 * 
 * EventBridge Scheduler allows you to create, run, and manage tasks at scale.
 * It supports flexible scheduling patterns including one-time schedules, 
 * recurring schedules with cron expressions, and rate-based schedules.
 */
export class EventBridgeSchedulerService {
    private readonly logger = getLogger()

    /**
     * Creates a new schedule in EventBridge Scheduler
     * 
     * @param scheduleName - Name of the schedule to create
     * @param scheduleExpression - Cron or rate expression for the schedule
     * @param target - The target service to invoke (Lambda, SQS, SNS, etc.)
     */
    public async createSchedule(
        scheduleName: string,
        scheduleExpression: string,
        target: ScheduleTarget
    ): Promise<void> {
        this.logger.info(`Creating EventBridge Scheduler schedule: ${scheduleName}`)
        
        // Implementation would go here
        // This would integrate with the AWS EventBridge Scheduler API
        
        throw new Error('EventBridge Scheduler integration not yet implemented')
    }

    /**
     * Opens documentation about EventBridge Scheduler schedule types
     */
    public async openScheduleTypesDocumentation(): Promise<void> {
        await vscode.env.openExternal(vscode.Uri.parse(eventBridgeSchedulerCreateScheduleUrl))
    }

    /**
     * Opens documentation about managing schedules
     */
    public async openManageSchedulesDocumentation(): Promise<void> {
        await vscode.env.openExternal(vscode.Uri.parse(eventBridgeSchedulerApiGatewayUrl))
    }

    /**
     * Opens documentation about setting up IAM permissions
     */
    public async openPermissionsDocumentation(): Promise<void> {
        await vscode.env.openExternal(vscode.Uri.parse(eventBridgeSchedulerRolePermissionsUrl))
    }
}

/**
 * Represents a target for an EventBridge Scheduler schedule
 */
export interface ScheduleTarget {
    /** The ARN of the target resource */
    arn: string
    
    /** IAM role ARN for scheduler to assume when invoking the target */
    roleArn: string
    
    /** Input data to pass to the target */
    input?: string
    
    /** Type of target (lambda, sqs, sns, etc.) */
    type: 'lambda' | 'sqs' | 'sns' | 'stepfunctions' | 'eventbridge' | 'kinesis'
}

/**
 * Configuration for creating a schedule
 */
export interface ScheduleConfig {
    /** Name of the schedule */
    name: string
    
    /** Description of the schedule */
    description?: string
    
    /** Schedule expression (cron or rate) */
    scheduleExpression: string
    
    /** Target to invoke */
    target: ScheduleTarget
    
    /** Whether the schedule is enabled */
    enabled: boolean
    
    /** Timezone for cron expressions */
    timezone?: string
    
    /** Flexible time window settings */
    flexibleTimeWindow?: {
        mode: 'OFF' | 'FLEXIBLE'
        maximumWindowInMinutes?: number
    }
}
