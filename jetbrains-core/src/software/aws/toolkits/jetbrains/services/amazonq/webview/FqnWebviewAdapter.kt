// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.webview

import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.time.withTimeout
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import java.time.Duration

/**
 * Exposes the FQN (Fully Qualified Name) and import reading capabilities that are implemented in TypeScript via a Kotlin API.
 */
class FqnWebviewAdapter(
    private val jcefBrowser: JBCefBrowserBase,
    private val browserConnector: BrowserConnector,
) {

    private val namesExtractionResponses: Channel<String> = Channel()
    private val receiveNames: String

    init {
        val receiveNamesFromBrowser = JBCefJSQuery.create(jcefBrowser)
        receiveNamesFromBrowser.addHandler { names: String ->
            namesExtractionResponses.trySend(names)
            null
        }
        receiveNames = receiveNamesFromBrowser.inject("names")
    }

    @Throws(TimeoutCancellationException::class)
    suspend fun readImports(args: String): String {
        browserConnector.uiReady.await()

        return try {
            withTimeout(Duration.ofMillis(1250)) {
                jcefBrowser.cefBrowser.executeJavaScript(
                    """
                    window.fqnExtractor.readImports($args.fileContent, $args.language).then(result => {
                        const names = JSON.stringify(Array.from(result));
                        $receiveNames
                    });
                    """.trimIndent(),
                    jcefBrowser.cefBrowser.url,
                    0,
                )
                namesExtractionResponses.receive()
            }
        } catch (e: TimeoutCancellationException) {
            logger.warn(e) { "Failed to read imports" }
            "[]"
        }
    }

    suspend fun extractNames(args: String): String {
        browserConnector.uiReady.await()

        return try {
            withTimeout(Duration.ofMillis(1250)) {
                jcefBrowser.cefBrowser.executeJavaScript(
                    """
                    window.fqnExtractor.extractCodeQuery($args.fileContent, $args.language, $args.codeSelection).then(({codeQuery, namesWereTruncated}) => {
                        const names = codeQuery === undefined ? `{"simpleNames": [], "fullyQualifiedNames": {"used": []}}` : JSON.stringify(codeQuery);
                        $receiveNames
                    });
                    """.trimIndent(),
                    jcefBrowser.cefBrowser.url,
                    0,
                )
                namesExtractionResponses.receive()
            }
        } catch (e: TimeoutCancellationException) {
            logger.warn(e) { "Failed to extract fully qualified names" }
            "{\"simpleNames\": [], \"fullyQualifiedNames\": {\"used\": []}}"
        }
    }

    companion object {
        private val logger = getLogger<FqnWebviewAdapter>()
    }
}
