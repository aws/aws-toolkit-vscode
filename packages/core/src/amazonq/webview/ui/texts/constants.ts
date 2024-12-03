/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const uiComponentsTexts = {
    mainTitle: 'Amazon Q',
    copy: 'Copy',
    insertAtCursorLabel: 'Insert at cursor',
    feedbackFormTitle: 'Report an issue',
    feedbackFormOptionsLabel: 'What type of issue would you like to report?',
    feedbackFormCommentLabel: 'Description of issue (optional):',
    feedbackThanks: 'Thanks for your feedback!',
    feedbackReportButtonLabel: 'Report an issue',
    codeSuggestions: 'Code suggestions',
    files: 'file(s)',
    clickFileToViewDiff: 'Click on a file to view diff.',
    showMore: 'Show more',
    save: 'Save',
    cancel: 'Cancel',
    submit: 'Submit',
    stopGenerating: 'Stop',
    copyToClipboard: 'Copied to clipboard',
    noMoreTabsTooltip: 'You can only open ten conversation tabs at a time.',
    codeSuggestionWithReferenceTitle: 'Some suggestions contain code with references.',
    spinnerText: 'Generating your answer...',
    changeAccepted: 'Change accepted',
    changeRejected: 'Change rejected',
    acceptChange: 'Accept change',
    rejectChange: 'Reject change',
    revertRejection: 'Revert rejection',
}
export const docUserGuide = 'https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/doc-generation.html'
export const userGuideURL = 'https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/software-dev.html'
export const manageAccessGuideURL =
    'https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/security_iam_manage-access-with-policies.html'
export const testGuideUrl = 'https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/test-generation.html'
export const reviewGuideUrl = 'https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/code-reviews.html'

export const helpMessage = `I'm Amazon Q, a generative AI assistant. Learn more about me below. Your feedback will help me improve.
\n\n### What I can do:
\n\n- Answer questions about AWS
\n\n- Answer questions about general programming concepts
\n\n- Answer questions about your workspace with @workspace
\n\n- Explain what a line of code or code function does
\n\n- Write unit tests and code
\n\n- Debug and fix code
\n\n- Refactor code
\n\n### What I don't do right now:
\n\n- Answer questions in languages other than English
\n\n- Remember conversations from your previous sessions
\n\n- Have information about your AWS account or your specific AWS resources
\n\n### Examples of questions I can answer:
\n\n- When should I use ElastiCache?
\n\n- How do I create an Application Load Balancer?
\n\n- Explain the <selected code> and ask clarifying questions about it.
\n\n- What is the syntax of declaring a variable in TypeScript?
\n\n### Special Commands
\n\n- /dev - Get code suggestions across files in your current project. Provide a brief prompt, such as "Implement a GET API."
\n\n- /doc - Create and update documentation for your repository.
\n\n- /review - Discover and address security and code quality issues.
\n\n- /test - Generate unit tests for a file.
\n\n- /transform - Transform your code. Use to upgrade Java code versions.
\n\n- /help - View chat topics and commands.
\n\n- /clear - Clear the conversation.
\n\n### Things to note:
\n\n- I may not always provide completely accurate or current information.
\n\n- Provide feedback by choosing the like or dislike buttons that appear below answers.
\n\n- When you use Amazon Q, AWS may, for service improvement purposes, store data about your usage and content. You can opt-out of sharing this data by following the steps in AI services opt-out policies. See <a href="https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/opt-out-IDE.html">here</a>
\n\n- Do not enter any confidential, sensitive, or personal information.
\n\n*For additional help, visit the [Amazon Q User Guide](${userGuideURL}).*`
