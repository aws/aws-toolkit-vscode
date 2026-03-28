/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Additional telemetry events for Amazon Q Dashboard integration
declare module './telemetry.gen' {
    interface TelemetryDefinitions {
        // Review functionality
        amazonq_reviewStart: {
            result: Result
            amazonqReviewScope: 'file' | 'project'
            amazonqReviewFileName?: string
            credentialStartUrl?: string
        }
        
        amazonq_reviewComplete: {
            result: Result
            amazonqReviewScope: 'file' | 'project'
            amazonqReviewIssuesFound: number
            amazonqReviewCriticalIssues: number
            amazonqReviewHighIssues: number
            amazonqReviewMediumIssues: number
            amazonqReviewLowIssues: number
            amazonqReviewInfoIssues: number
            amazonqReviewDuration: number
            credentialStartUrl?: string
        }
        
        amazonq_reviewError: {
            result: Result
            amazonqReviewScope: 'file' | 'project'
            amazonqReviewErrorCode: string
            credentialStartUrl?: string
        }
        
        amazonq_reviewFixApplied: {
            result: Result
            amazonqReviewIssueType: string
            credentialStartUrl?: string
        }
        
        // Development functionality
        amazonq_codeGeneration: {
            result: Result
            amazonqCodeGenLanguage: string
            amazonqCodeGenLinesGenerated: number
            amazonqCodeGenFilesGenerated: number
            credentialStartUrl?: string
        }
        
        amazonq_projectCreation: {
            result: Result
            amazonqProjectType: string
            credentialStartUrl?: string
        }
        
        amazonq_developmentActivity: {
            result: Result
            amazonqActivityType: 'explain' | 'optimize' | 'refactor' | 'test'
            amazonqActivityLanguage: string
            amazonqActivityDuration: number
            credentialStartUrl?: string
        }
        
        amazonq_featureUsage: {
            result: Result
            amazonqFeatureName: string
            amazonqFeatureContext?: string
            credentialStartUrl?: string
        }
        
        // SAM CLI functionality
        amazonq_samCommand: {
            result: Result
            amazonqSamCommandType: 'build' | 'deploy' | 'init' | 'local-invoke' | 'start-api'
            amazonqSamCommandDuration: number
            amazonqSamErrorCode?: string
            credentialStartUrl?: string
        }
        
        amazonq_samInit: {
            result: Result
            amazonqSamRuntime: string
            amazonqSamTemplate: string
            credentialStartUrl?: string
        }
        
        amazonq_samDeploy: {
            result: Result
            amazonqSamStackName: string
            amazonqSamRegion: string
            amazonqSamResourceCount?: number
            credentialStartUrl?: string
        }
        
        amazonq_samLocalInvoke: {
            result: Result
            amazonqSamFunctionName: string
            amazonqSamRuntime: string
            amazonqSamInvokeDuration: number
            credentialStartUrl?: string
        }
    }
}