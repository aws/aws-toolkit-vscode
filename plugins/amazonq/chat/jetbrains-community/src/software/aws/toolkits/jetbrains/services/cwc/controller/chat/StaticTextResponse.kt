// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.controller.chat

enum class StaticTextResponse(
    val message: String,
    val followUpsHeader: String? = null,
    val followUps: List<String> = emptyList(),
) {
    Help(
        message = """
            I'm Amazon Q, a generative AI assistant. Learn more about me below. Your feedback will help me improve.
            ### What I can do:
            - Answer questions about AWS
            - Answer questions about general programming concepts
            - Explain what a line of code or code function does
            - Write unit tests and code
            - Debug and fix code
            - Refactor code
            ### What I don't do right now:
            - Answer questions in languages other than English
            - Remember conversations from your previous sessions
            - Have information about your AWS account or your specific AWS resources
            ### Examples of questions I can answer:
            - When should I use ElastiCache?
            - How do I create an Application Load Balancer?
            - Explain the &lt;selected code&gt; and ask clarifying questions about it.
            - What is the syntax of declaring a variable in TypeScript?
            ### Special Commands
            - /clear - Clear the conversation.
            - /dev - Get code suggestions across files in your current project. Provide a brief prompt, such as "Implement a GET API."<strong> Only available through CodeWhisperer Professional Tier.</strong>
            - /transform - Transform your code. Use to upgrade Java code versions. <strong>Only available through CodeWhisperer Professional Tier.</strong>
            - /help - View chat topics and commands.
            ### Things to note:
            - I may not always provide completely accurate or current information.
            - Provide feedback by choosing the like or dislike buttons that appear below answers.
            - When you use Amazon Q, AWS may, for service improvement purposes, store data about your usage and content. You can opt-out of sharing this data by following the steps in AI services opt-out policies. See <a href="https://docs.aws.amazon.com/codewhisperer/latest/userguide/sharing-data.html">here</a>
            - Do not enter any confidential, sensitive, or personal information.
            
            *For additional help, visit the [Amazon Q User Guide](https://docs.aws.amazon.com/amazonq/latest/aws-builder-use-ug/getting-started.html).*
        """.trimIndent(),
    ),
    OnboardingHelp(
        message = """
            ### What I can do:
            - Answer questions about AWS
            - Answer questions about general programming concepts
            - Explain what a line of code or code function does
            - Write unit tests and code
            - Debug and fix code
            - Refactor code
        """.trimIndent(),
        followUpsHeader = "Try Examples:",
        followUps = listOf(
            "Should I use AWS Lambda or EC2 for a scalable web application backend?",
            "What is the syntax of declaring a variable in TypeScript?",
            "Write code for uploading a file to an s3 bucket in typescript",
        ),
    ),
}
