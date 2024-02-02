// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.editor.VisualPosition
import com.intellij.openapi.project.Project
import org.gradle.internal.impldep.com.amazonaws.ResponseMetadata.AWS_REQUEST_ID
import org.mockito.kotlin.mock
import software.amazon.awssdk.awscore.DefaultAwsResponseMetadata
import software.amazon.awssdk.awscore.exception.AwsErrorDetails
import software.amazon.awssdk.http.SdkHttpResponse
import software.amazon.awssdk.services.codewhispererruntime.model.CodeWhispererRuntimeException
import software.amazon.awssdk.services.codewhispererruntime.model.Completion
import software.amazon.awssdk.services.codewhispererruntime.model.FileContext
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsResponse
import software.amazon.awssdk.services.codewhispererruntime.model.Import
import software.amazon.awssdk.services.codewhispererruntime.model.ProgrammingLanguage
import software.amazon.awssdk.services.codewhispererruntime.model.RecommendationsWithReferencesPreference
import software.amazon.awssdk.services.codewhispererruntime.model.Reference
import software.amazon.awssdk.services.codewhispererruntime.model.Span
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererC
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererCpp
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererCsharp
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererGo
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJavaScript
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJsx
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererKotlin
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPhp
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPython
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererRuby
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererScala
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererShell
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererSql
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererTypeScript
import software.aws.toolkits.jetbrains.services.codewhisperer.model.CaretContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.CaretPosition
import software.aws.toolkits.jetbrains.services.codewhisperer.model.Chunk
import software.aws.toolkits.jetbrains.services.codewhisperer.model.DetailContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.FileContextInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.model.LatencyContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.RecommendationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.SessionContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.SupplementalContextInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.model.TriggerTypeInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererAutomatedTriggerType
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.services.codewhisperer.service.RequestContext
import software.aws.toolkits.jetbrains.services.codewhisperer.service.ResponseContext
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CrossFileStrategy
import software.aws.toolkits.jetbrains.services.codewhisperer.util.UtgStrategy
import software.aws.toolkits.telemetry.CodewhispererCompletionType
import software.aws.toolkits.telemetry.CodewhispererSuggestionState
import software.aws.toolkits.telemetry.CodewhispererTriggerType
import kotlin.random.Random

object CodeWhispererTestUtil {
    const val testSessionId = "test_codewhisperer_session_id"
    const val testRequestId = "test_aws_request_id"
    const val testRequestIdForCodeWhispererException = "test_request_id_for_codewhispererException"
    const val codeWhispererRecommendationActionId = "CodeWhispererRecommendationAction"
    const val codeWhispererCodeScanActionId = "codewhisperer.toolbar.security.scan"
    const val testValidAccessToken = "test_valid_access_token"
    const val testNextToken = "test_next_token"
    private val testReferenceInfoPair = listOf(
        Pair("MIT", "testRepo1"),
        Pair("Apache-2.0", "testRepo2"),
        Pair("BSD-4-Clause", "testRepo3")
    )
    val metadata: DefaultAwsResponseMetadata = DefaultAwsResponseMetadata.create(
        mapOf(AWS_REQUEST_ID to testRequestId)
    )
    val sdkHttpResponse = SdkHttpResponse.builder().headers(
        mapOf(CodeWhispererService.KET_SESSION_ID to listOf(testSessionId))
    ).build()
    private val errorDetail = AwsErrorDetails.builder()
        .errorCode("123")
        .errorMessage("something went wrong")
        .sdkHttpResponse(sdkHttpResponse)
        .build()
    val testCodeWhispererException = CodeWhispererRuntimeException.builder()
        .requestId(testRequestIdForCodeWhispererException)
        .awsErrorDetails(errorDetail)
        .build() as CodeWhispererRuntimeException

    val pythonRequest: GenerateCompletionsRequest = GenerateCompletionsRequest.builder()
        .fileContext(
            FileContext.builder()
                .filename("test.py")
                .programmingLanguage(
                    ProgrammingLanguage.builder()
                        .languageName("python")
                        .build()
                )
                .build()
        )
        .nextToken("")
        .referenceTrackerConfiguration { it.recommendationsWithReferences(RecommendationsWithReferencesPreference.ALLOW) }
        .maxResults(5)
        .build()

    val pythonResponse: GenerateCompletionsResponse = GenerateCompletionsResponse.builder()
        .completions(
            generateMockCompletionDetail("(x, y):\n    return x + y"),
            generateMockCompletionDetail("(a, b):\n    return a + b"),
            generateMockCompletionDetail("test recommendation 3"),
            generateMockCompletionDetail("test recommendation 4"),
            generateMockCompletionDetail("test recommendation 5")
        )
        .nextToken("")
        .responseMetadata(metadata)
        .sdkHttpResponse(sdkHttpResponse)
        .build() as GenerateCompletionsResponse
    val pythonResponseWithNonEmptyToken = pythonResponseWithToken(testNextToken)
    val javaResponse: GenerateCompletionsResponse = GenerateCompletionsResponse.builder()
        .completions(
            generateMockCompletionDetail("(x, y) {\n        return x + y\n    }"),
            generateMockCompletionDetail("(a, b) {\n        return a + b\n    }"),
            generateMockCompletionDetail("test recommendation 3"),
            generateMockCompletionDetail("test recommendation 4"),
            generateMockCompletionDetail("test recommendation 5")
        )
        .nextToken("")
        .responseMetadata(metadata)
        .sdkHttpResponse(sdkHttpResponse)
        .build() as GenerateCompletionsResponse
    val emptyListResponse: GenerateCompletionsResponse = GenerateCompletionsResponse.builder()
        .completions(listOf())
        .nextToken("")
        .responseMetadata(metadata)
        .sdkHttpResponse(sdkHttpResponse)
        .build() as GenerateCompletionsResponse
    val listOfEmptyRecommendationResponse: GenerateCompletionsResponse = GenerateCompletionsResponse.builder()
        .completions(
            generateMockCompletionDetail(""),
            generateMockCompletionDetail(""),
            generateMockCompletionDetail(""),
        )
        .nextToken("")
        .responseMetadata(metadata)
        .sdkHttpResponse(sdkHttpResponse)
        .build() as GenerateCompletionsResponse
    val listOfMixedEmptyAndNonEmptyRecommendationResponse: GenerateCompletionsResponse = GenerateCompletionsResponse.builder()
        .completions(
            generateMockCompletionDetail(""),
            generateMockCompletionDetail("test recommendation 3"),
            generateMockCompletionDetail(""),
            generateMockCompletionDetail("test recommendation 4"),
            generateMockCompletionDetail("test recommendation 5")
        )
        .nextToken("")
        .responseMetadata(metadata)
        .sdkHttpResponse(sdkHttpResponse)
        .build() as GenerateCompletionsResponse

    const val pythonFileName = "test.py"
    const val javaFileName = "test.java"
    const val cppFileName = "test.cpp"
    const val jsFileName = "test.js"
    const val pythonTestLeftContext = "def addTwoNumbers"
    const val keystrokeInput = "a"
    const val cppTestLeftContext = "int addTwoNumbers"
    const val javaTestContext = "public class Test {\n    public static void main\n}"
    const val yaml_langauge = "yaml"
    const val leftContext_success_Iac = "# Create an S3 Bucket named CodeWhisperer in CloudFormation"
    const val leftContext_failure_Iac = "Create an S3 Bucket named CodeWhisperer"

    internal fun pythonResponseWithToken(token: String): GenerateCompletionsResponse =
        pythonResponse.toBuilder().nextToken(token).build()

    internal fun generateMockCompletionDetail(content: String): Completion {
        val referenceInfo = getReferenceInfo()
        return Completion.builder().content(content)
            .references(
                generateMockReferences(referenceInfo.first, referenceInfo.second, 0, content.length)
            )
            .build()
    }

    internal fun getReferenceInfo() = testReferenceInfoPair[Random.nextInt(testReferenceInfoPair.size)]

    internal fun generateMockCompletionDetail(
        content: String,
        licenseName: String,
        repository: String,
        start: Int,
        end: Int
    ): Completion =
        Completion.builder()
            .content(content)
            .references(generateMockReferences(licenseName, repository, start, end))
            .build()

    private fun generateMockReferences(licenseName: String, repository: String, start: Int, end: Int) =
        Reference.builder()
            .licenseName(licenseName)
            .repository(repository)
            .recommendationContentSpan(
                Span.builder()
                    .start(start)
                    .end(end)
                    .build()
            )
            .build()
}

fun aRequestContext(
    project: Project,
    myFileContextInfo: FileContextInfo? = null,
    mySupplementalContextInfo: SupplementalContextInfo? = null
): RequestContext {
    val triggerType = aTriggerType()
    val automatedTriggerType = if (triggerType == CodewhispererTriggerType.AutoTrigger) {
        listOf(
            CodeWhispererAutomatedTriggerType.IdleTime(),
            CodeWhispererAutomatedTriggerType.Enter(),
            CodeWhispererAutomatedTriggerType.SpecialChar('a'),
            CodeWhispererAutomatedTriggerType.IntelliSense()
        ).random()
    } else {
        CodeWhispererAutomatedTriggerType.Unknown()
    }

    return RequestContext(
        project,
        mock(),
        TriggerTypeInfo(triggerType, automatedTriggerType),
        CaretPosition(Random.nextInt(), Random.nextInt()),
        fileContextInfo = myFileContextInfo ?: aFileContextInfo(),
        supplementalContext = mySupplementalContextInfo ?: aSupplementalContextInfo(),
        null,
        LatencyContext(
            Random.nextLong(),
            Random.nextLong(),
            Random.nextLong(),
            Random.nextLong(),
            Random.nextDouble(),
            Random.nextLong(),
            Random.nextLong(),
            Random.nextLong(),
            Random.nextLong(),
            Random.nextLong(),
            Random.nextLong(),
            aString()
        ),
        customizationArn = null
    )
}

fun aSupplementalContextInfo(myContents: List<Chunk>? = null, myIsUtg: Boolean? = null, myLatency: Long? = null): SupplementalContextInfo {
    val contents = mutableListOf<Chunk>()
    val numberOfContent = Random.nextInt(1, 4)
    repeat(numberOfContent) {
        contents.add(
            Chunk(
                content = aString(),
                path = aString(),
            )
        )
    }

    val isUtg = Random.nextBoolean()
    val latency = Random.nextLong(from = 0L, until = 100L)

    return SupplementalContextInfo(
        isUtg = myIsUtg ?: isUtg,
        latency = myLatency ?: latency,
        contents = myContents ?: contents,
        targetFileName = aString(),
        strategy = if (myIsUtg ?: isUtg) UtgStrategy.ByName else CrossFileStrategy.OpenTabsBM25
    )
}

fun aRecommendationContext(): RecommendationContext {
    val details = mutableListOf<DetailContext>()
    val size = Random.nextInt(1, 5)
    for (i in 1..size) {
        details.add(
            i - 1,
            DetailContext(
                aString(),
                aCompletion(),
                aCompletion(),
                listOf(true, false).random(),
                listOf(true, false).random(),
                aString(),
                CodewhispererCompletionType.Line
            )
        )
    }

    return RecommendationContext(
        details,
        aString(),
        aString(),
        VisualPosition(Random.nextInt(1, 100), Random.nextInt(1, 100))
    )
}

/**
 * util to generate a RecommendationContext and a SessionContext given expected decisions
 */
fun aRecommendationContextAndSessionContext(decisions: List<CodewhispererSuggestionState>): Pair<RecommendationContext, SessionContext> {
    val table = CodewhispererSuggestionState.values().associateWith { 0 }.toMutableMap()
    decisions.forEach {
        table[it]?.let { curCount -> table[it] = 1 + curCount }
    }

    val details = mutableListOf<DetailContext>()
    decisions.forEach { decision ->
        val toAdd = if (decision == CodewhispererSuggestionState.Empty) {
            val completion = aCompletion("", true, 0, 0)
            DetailContext(aString(), completion, completion, Random.nextBoolean(), Random.nextBoolean(), aString(), CodewhispererCompletionType.Line)
        } else if (decision == CodewhispererSuggestionState.Discard) {
            val completion = aCompletion()
            DetailContext(aString(), completion, completion, true, Random.nextBoolean(), aString(), CodewhispererCompletionType.Line)
        } else {
            val completion = aCompletion()
            DetailContext(aString(), completion, completion, false, Random.nextBoolean(), aString(), CodewhispererCompletionType.Line)
        }

        details.add(toAdd)
    }

    val recommendationContext = RecommendationContext(
        details,
        aString(),
        aString(),
        VisualPosition(Random.nextInt(1, 100), Random.nextInt(1, 100))
    )

    val selectedIndex = decisions.indexOfFirst { it == CodewhispererSuggestionState.Accept }.let {
        if (it != -1) {
            it
        } else {
            0
        }
    }

    val seen = mutableSetOf<Int>()
    decisions.forEachIndexed { index, decision ->
        if (decision != CodewhispererSuggestionState.Unseen) {
            seen.add(index)
        }
    }

    val sessionContext = SessionContext(
        selectedIndex = selectedIndex,
        seen = seen
    )
    return recommendationContext to sessionContext
}

fun aCompletion(content: String? = null, isEmpty: Boolean = false, referenceCount: Int? = null, importCount: Int? = null): Completion {
    val myReferenceCount = referenceCount ?: Random.nextInt(0, 4)
    val myImportCount = importCount ?: Random.nextInt(0, 4)

    val references = List(myReferenceCount) {
        Reference.builder()
            .licenseName(aString())
            .build()
    }

    val imports = List(myImportCount) {
        Import.builder()
            .statement(aString())
            .build()
    }

    return Completion.builder()
        .content(content ?: if (!isEmpty) aString() else "")
        .references(references)
        .mostRelevantMissingImports(imports)
        .build()
}

fun aResponseContext(): ResponseContext = ResponseContext(aString())

fun aFileContextInfo(language: CodeWhispererProgrammingLanguage? = null): FileContextInfo {
    val caretContextInfo = CaretContext(aString(), aString(), aString())
    val fileName = aString()

    val programmingLanguage = language ?: listOf(
        CodeWhispererPython.INSTANCE,
        CodeWhispererJava.INSTANCE
    ).random()

    return FileContextInfo(caretContextInfo, fileName, programmingLanguage)
}

fun aTriggerType(): CodewhispererTriggerType =
    CodewhispererTriggerType.values().filterNot { it == CodewhispererTriggerType.Unknown }.random()

fun aCompletionType(): CodewhispererCompletionType =
    CodewhispererCompletionType.values().filterNot { it == CodewhispererCompletionType.Unknown }.random()

fun aSuggestionState(): CodewhispererSuggestionState =
    CodewhispererSuggestionState.values().filterNot { it == CodewhispererSuggestionState.Unknown }.random()

fun aProgrammingLanguage(): CodeWhispererProgrammingLanguage = listOf(
    CodeWhispererJava.INSTANCE,
    CodeWhispererPython.INSTANCE,
    CodeWhispererJavaScript.INSTANCE,
    CodeWhispererTypeScript.INSTANCE,
    CodeWhispererJsx.INSTANCE,
    CodeWhispererCsharp.INSTANCE,
    CodeWhispererKotlin.INSTANCE,
    CodeWhispererC.INSTANCE,
    CodeWhispererCpp.INSTANCE,
    CodeWhispererGo.INSTANCE,
    CodeWhispererPhp.INSTANCE,
    CodeWhispererRuby.INSTANCE,
    CodeWhispererScala.INSTANCE,
    CodeWhispererShell.INSTANCE,
    CodeWhispererSql.INSTANCE
).random()
