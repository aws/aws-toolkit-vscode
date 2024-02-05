// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.intellij

import org.gradle.api.Project
import org.gradle.api.provider.Provider
import org.gradle.api.provider.ProviderFactory


enum class IdeFlavor { GW, IC, IU, RD }

object IdeVersions {
    private val commonPlugins = arrayOf(
        "vcs-git",
        "org.jetbrains.plugins.terminal",
        "org.jetbrains.plugins.yaml"
    )

    private val ideProfiles = listOf(
        Profile(
            name = "2023.1",
            community = ProductProfile(
                sdkFlavor = IdeFlavor.IC,
                sdkVersion = "2023.1",
                plugins = commonPlugins + listOf(
                    "java",
                    "com.intellij.gradle",
                    "org.jetbrains.idea.maven",
                    "PythonCore:231.8109.144",
                    "Docker:231.8109.217"
                )
            ),
            ultimate = ProductProfile(
                sdkFlavor = IdeFlavor.IU,
                sdkVersion = "2023.1",
                plugins = commonPlugins + listOf(
                    "JavaScript",
                    // Transitive dependency needed for javascript
                    // Can remove when https://github.com/JetBrains/gradle-intellij-plugin/issues/608 is fixed
                    "com.intellij.css",
                    "JavaScriptDebugger",
                    "com.intellij.database",
                    "com.jetbrains.codeWithMe",
                    "Pythonid:231.8109.175",
                    "org.jetbrains.plugins.go:231.8109.175",
                    // https://github.com/JetBrains/gradle-intellij-plugin/issues/1056
                    "org.intellij.intelliLang"
                )
            ),
            rider = RiderProfile(
                sdkVersion = "2023.1",
                plugins = commonPlugins + listOf(
                    "rider-plugins-appender" // Workaround for https://youtrack.jetbrains.com/issue/IDEA-179607
                ),
                netFrameworkTarget = "net472",
                rdGenVersion = "2023.1.2",
                nugetVersion = "2023.1.0"
            )
        ),
        Profile(
            name = "2023.2",
            community = ProductProfile(
                sdkFlavor = IdeFlavor.IC,
                sdkVersion = "2023.2.2",
                plugins = commonPlugins + listOf(
                    "java",
                    "com.intellij.gradle",
                    "org.jetbrains.idea.maven",
                    "PythonCore:232.8660.185",
                    "Docker:232.8660.185"
                )
            ),
            ultimate = ProductProfile(
                sdkFlavor = IdeFlavor.IU,
                sdkVersion = "2023.2.2",
                plugins = commonPlugins + listOf(
                    "JavaScript",
                    // Transitive dependency needed for javascript
                    // Can remove when https://github.com/JetBrains/gradle-intellij-plugin/issues/608 is fixed
                    "com.intellij.css",
                    "JavaScriptDebugger",
                    "com.intellij.database",
                    "com.jetbrains.codeWithMe",
                    "Pythonid:232.8660.185",
                    "org.jetbrains.plugins.go:232.8660.142",
                    // https://github.com/JetBrains/gradle-intellij-plugin/issues/1056
                    "org.intellij.intelliLang"
                )
            ),
            rider = RiderProfile(
                sdkVersion = "2023.2",
                plugins = commonPlugins + listOf(
                    "rider-plugins-appender" // Workaround for https://youtrack.jetbrains.com/issue/IDEA-179607
                ),
                netFrameworkTarget = "net472",
                rdGenVersion = "2023.2.3",
                nugetVersion = "2023.2.0"
            )
        ),
        Profile(
            name = "2023.3",
            gateway = ProductProfile(
                sdkFlavor = IdeFlavor.GW,
                sdkVersion = "233.11799-EAP-CANDIDATE-SNAPSHOT",
                plugins = arrayOf("org.jetbrains.plugins.terminal")
            ),
            community = ProductProfile(
                sdkFlavor = IdeFlavor.IC,
                sdkVersion = "2023.3",
                plugins = commonPlugins + listOf(
                    "java",
                    "com.intellij.gradle",
                    "org.jetbrains.idea.maven",
                    "PythonCore:233.11799.241",
                    "Docker:233.11799.244"
                )
            ),
            ultimate = ProductProfile(
                sdkFlavor = IdeFlavor.IU,
                sdkVersion = "2023.3",
                plugins = commonPlugins + listOf(
                    "JavaScript",
                    // Transitive dependency needed for javascript
                    // Can remove when https://github.com/JetBrains/gradle-intellij-plugin/issues/608 is fixed
                    "com.intellij.css",
                    "JavaScriptDebugger",
                    "com.intellij.database",
                    "com.jetbrains.codeWithMe",
                    "Pythonid:233.11799.241",
                    "org.jetbrains.plugins.go:233.11799.196",
                    // https://github.com/JetBrains/gradle-intellij-plugin/issues/1056
                    "org.intellij.intelliLang"
                )
            ),
            rider = RiderProfile(
                sdkVersion = "2023.3",
                plugins = commonPlugins + listOf(
                    "rider-plugins-appender" // Workaround for https://youtrack.jetbrains.com/issue/IDEA-179607
                ),
                netFrameworkTarget = "net472",
                rdGenVersion = "2023.3.2",
                nugetVersion = "2023.3.0"
            )
        ),
        Profile(
            name = "2024.1",
            gateway = ProductProfile(
                sdkFlavor = IdeFlavor.GW,
                sdkVersion = "241.9959-EAP-CANDIDATE-SNAPSHOT",
                plugins = arrayOf("org.jetbrains.plugins.terminal")
            ),
            community = ProductProfile(
                sdkFlavor = IdeFlavor.IC,
                sdkVersion = "241.9959-EAP-CANDIDATE-SNAPSHOT",
                plugins = commonPlugins + listOf(
                    "java",
                    "com.intellij.gradle",
                    "org.jetbrains.idea.maven",
                    "PythonCore:241.9959.31",
                    "Docker:241.9959.32"
                )
            ),
            ultimate = ProductProfile(
                sdkFlavor = IdeFlavor.IU,
                sdkVersion = "241.9959-EAP-CANDIDATE-SNAPSHOT",
                plugins = commonPlugins + listOf(
                    "JavaScript",
                    // Transitive dependency needed for javascript
                    // Can remove when https://github.com/JetBrains/gradle-intellij-plugin/issues/608 is fixed
                    "com.intellij.css",
                    "JavaScriptDebugger",
                    "com.intellij.database",
                    "com.jetbrains.codeWithMe",
                    "Pythonid:241.9959.31",
                    "org.jetbrains.plugins.go:241.9959.31",
                    // https://github.com/JetBrains/gradle-intellij-plugin/issues/1056
                    "org.intellij.intelliLang"
                )
            ),
            rider = RiderProfile(
                sdkVersion = "2024.1-EAP2-SNAPSHOT",
                plugins = commonPlugins + listOf(
                    "rider-plugins-appender" // Workaround for https://youtrack.jetbrains.com/issue/IDEA-179607
                ),
                netFrameworkTarget = "net472",
                rdGenVersion = "2024.1.0-pre1",
                nugetVersion = "2024.1.0-eap02"
            )
        ),

    ).associateBy { it.name }

    fun ideProfile(project: Project): Profile = ideProfile(project.providers).get()

    fun ideProfile(providers: ProviderFactory): Provider<Profile> = resolveIdeProfileName(providers).map {
        ideProfiles[it] ?: throw IllegalStateException("Can't find profile for $it")
    }

    private fun resolveIdeProfileName(providers: ProviderFactory): Provider<String> = providers.gradleProperty("ideProfileName")
}

open class ProductProfile(
    val sdkFlavor: IdeFlavor,
    val sdkVersion: String,
    val plugins: Array<String> = emptyArray()
) {
    fun version(): String? = if (!isLocalPath(sdkVersion)) {
        sdkFlavor.name + "-" + sdkVersion
    } else {
        null
    }

    fun localPath(): String? = sdkVersion.takeIf {
        isLocalPath(it)
    }

    private fun isLocalPath(str: String) = str.startsWith("/") || str.getOrNull(1) == ':'
}

class RiderProfile(
    sdkVersion: String,
    plugins: Array<String>,
    val netFrameworkTarget: String,
    val rdGenVersion: String, // https://central.sonatype.com/artifact/com.jetbrains.rd/rd-gen/2023.2.3/versions
    val nugetVersion: String // https://www.nuget.org/packages/JetBrains.Rider.SDK/
) : ProductProfile(IdeFlavor.RD, sdkVersion, plugins)

class Profile(
    val name: String,
    val shortName: String = shortenedIdeProfileName(name),
    val sinceVersion: String = shortName,
    val untilVersion: String = "$sinceVersion.*",
    val gateway: ProductProfile? = null,
    val community: ProductProfile,
    val ultimate: ProductProfile,
    val rider: RiderProfile,
)

private fun shortenedIdeProfileName(sdkName: String): String {
    val parts = sdkName.trim().split(".")
    return parts[0].substring(2) + parts[1]
}
