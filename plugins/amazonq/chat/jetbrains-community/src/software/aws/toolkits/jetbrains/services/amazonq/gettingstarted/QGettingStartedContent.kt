// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.gettingstarted

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.ui.JBColor
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import com.intellij.ui.jcef.JCEFHtmlPanel
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLoadHandlerAdapter
import software.aws.toolkits.jetbrains.core.coroutines.disposableCoroutineScope
import software.aws.toolkits.jetbrains.services.amazonq.toolwindow.AmazonQToolWindow
import software.aws.toolkits.jetbrains.services.amazonq.webview.theme.EditorThemeAdapter
import software.aws.toolkits.jetbrains.services.codewhisperer.learn.LearnCodeWhispererEditorProvider
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.UiTelemetry
import java.util.Base64
import java.util.function.Function

class QGettingStartedContent(val project: Project) : Disposable {
    val jcefBrowser: JBCefBrowserBase = JCEFHtmlPanel("about:blank")
    val receiveMessageQuery = JBCefJSQuery.create(jcefBrowser)

    init {
        jcefBrowser.jbCefClient.addLoadHandler(
            object : CefLoadHandlerAdapter() {
                override fun onLoadEnd(browser: CefBrowser, frame: CefFrame, httpStatusCode: Int) {
                    // only needs to be done once
                    jcefBrowser.jbCefClient.removeLoadHandler(this, browser)

                    disposableCoroutineScope(this@QGettingStartedContent).launch {
                        EditorThemeAdapter().onThemeChange()
                            .distinctUntilChanged()
                            .onEach {
                                val js = if (it.darkMode) {
                                    "document.body.classList.add('$darkThemeClass');document.body.classList.remove('$lightThemeClass');"
                                } else {
                                    "document.body.classList.add('$lightThemeClass');document.body.classList.remove('$darkThemeClass');"
                                }
                                browser.executeJavaScript(js, browser.url, 0)
                            }
                            .launchIn(this)
                    }
                }
            },
            jcefBrowser.cefBrowser
        )
        loadWebView()
        val handler = Function<String, JBCefJSQuery.Response> {
            val command = jacksonObjectMapper().readTree(it).get("command").asText()
            when (command) {
                "goToHelp" -> {
                    UiTelemetry.click(project, "amazonq_tryExamples")
                    LearnCodeWhispererEditorProvider.openEditor(project)
                }
                "sendToQ" -> {
                    UiTelemetry.click(project, "amazonq_meet_askq")
                    AmazonQToolWindow.getStarted(project)
                }
            }
            null
        }
        receiveMessageQuery.addHandler(handler)
    }

    fun component() = jcefBrowser.component

    private fun loadWebView() {
        // load the web app
        jcefBrowser.loadHTML(getWebviewHTML())
    }

    private fun getWebviewHTML(): String {
        val colorMode = if (JBColor.isBright()) lightThemeClass else darkThemeClass
        val bgLogoDark = getBase64EncodedImageString("/icons/logos/Amazon-Q-Icon_White_Medium.svg")
        val qLogo = getBase64EncodedImageString("/icons/logos/Amazon-Q-Icon_Gradient_Medium.svg")
        val bgLogoLight = getBase64EncodedImageString("/icons/logos/Amazon-Q-Icon_Squid-Ink_Medium.svg")
        val cwLogoDark = getBase64EncodedImageString("/icons/logos/CW_InlineSuggestions_dark.svg")
        val cwLogoLight = getBase64EncodedImageString("/icons/logos/CW_InlineSuggestions_light.svg")
        val postMessageToJavaJsCode = receiveMessageQuery.inject("JSON.stringify(message)")

        return """
    <!DOCTYPE html>
    <html lang="en">
        <head>
            <meta charset="UTF-8">
            <!--CSP?-->
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
            body.light #bg {
                content: url(${getImageSourceFromEncodedString(bgLogoLight)});
                opacity: 0.05;
            }
            body.dark #bg {
                content: url(${getImageSourceFromEncodedString(bgLogoDark)});
                opacity: 0.05;
            }
            body.light #codewhispererLogo {
                content: url(${getImageSourceFromEncodedString(cwLogoDark)});
            }
            body.dark #codewhispererLogo {
                content: url(${getImageSourceFromEncodedString(cwLogoLight)});
            }
            body {
                height: 100vh;
                font-family: system-ui;
            }
            #bg {
                position: fixed;
                left: 70%;
                top: -10%;
                overflow: hidden;
                transform: scale(2);
                pointer-events:none;
                user-select: none;
            }
            #sendToQButton {
                background: linear-gradient(14deg, rgba(52,20,120,1) 0%, rgba(91,41,196,1) 25%, rgba(117,55,247,1) 50%, rgba(73,125,254,1) 75%, rgba(170,233,255,1) 100%);
                color: white;
                border-radius: 6px;
                border: none;
                font-size: 20px;
                padding: 0.5em 1em;
                text-align: center;
                cursor: pointer;
            }
            #wrapper {
                height: 100%;
                width: 100%;
                min-width: 600px;
                overflow-y: auto;
                overflow-x: auto;
                display: flex;
                flex-direction: row;
                justify-content: center;
                align-items: center;
            }
            #content {
                max-width: 550px;
                padding: 30px;
                display: flex;
                flex-direction: column;
                gap: 30px;
                align-items: center;
            }
            #codewhisperer {
                display: flex;
                align-items: center;
                flex-direction: row;
                gap: 40px;
                flex-wrap: nowrap;
            }
            #codewhisperer div p {
                margin: 0px;
                font-size: 12pt;
            }
            #qLogo {
                width: 70px
            }
            #imageContainer {
                width: 40px;
                height: auto;
                flex-shrink: 0;
                flex-grow: 0;
            }
            #textWrapper {
                flex-shrink: 1;
                flex-grow: 1;
                
            }
            #header {
                text-align: center;
                margin: 0;
                color: #FFFFFF
            }
            body.light #textWrapper {
                color: #000000
            }
            body.dark #textWrapper {
                color: #FFFFFF
            }
            body.light #header {
                color: #000000
            }
            body.dark #header {
                color: #FFFFFF
            }
            a {
                cursor: pointer;
                text-decoration: underline;
                color: #589DF6;
            }
            
            .spacingrow {
                display: flex;
                flex-direction: row;
                gap: 40px;
                flex-wrap: nowrap;
            }
            </style>
        </head>
        <body class="$colorMode">
            <img id="bg">
            <div id="wrapper">
                <div id="content">
                    <img id="qLogo" src="${getImageSourceFromEncodedString(qLogo)}"/>
                    <h1 id="header">${message("q.onboarding.description")}</h1>
                    <div id="buttonContainer">
                        <button id="sendToQButton">${message("q.onboarding.button.text")}</button>
                    </div>
                    <!-- spacing -->
                    <div class="spacingrow"> </div>
                    <div class="spacingrow"> </div>
                    <!-- end spacing -->
                    <div id="codewhisperer">
                        <div id="imageContainer">
                            <img id="codewhispererLogo"/>
                        </div>
                        <div id="textWrapper">
                            <p>${message("q.onboarding.codewhisperer.description")}<br><a id="goToHelpLink">Try examples</a></p>
                        </div>
                    </div>
                </div>
            </div>
            <script>
                (function() {
                    window.ideApi = {
                     postMessage: message => {
                         $postMessageToJavaJsCode
                     }
                };
                    const sendToQ = () => { window.ideApi.postMessage({ command: "sendToQ" }) }
                    const goToHelp = () => { window.ideApi.postMessage({ command: "goToHelp" }) }
                    const sendToQButton = document.getElementById('sendToQButton')
                    sendToQButton.onclick = sendToQ
                    const goToHelpLink = document.getElementById('goToHelpLink')
                    goToHelpLink.onclick = goToHelp
                }())
            </script>
        </body>
    </html>
        """.trimIndent()
    }

    private fun getBase64EncodedImageString(imageLocation: String) = QGettingStartedContent::class.java.getResourceAsStream(imageLocation).use {
        Base64.getEncoder().encodeToString(it?.readAllBytes() ?: return@use null)
    }

    private fun getImageSourceFromEncodedString(imageName: String?) = "data:image/svg+xml;base64,$imageName"

    override fun dispose() {
    }

    companion object {
        private const val darkThemeClass = "dark"
        private const val lightThemeClass = "light"
    }
}
