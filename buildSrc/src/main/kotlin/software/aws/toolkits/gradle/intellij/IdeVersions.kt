// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.intellij

import org.gradle.api.Project
import org.gradle.api.provider.Provider
import org.gradle.api.provider.ProviderFactory


enum class IdeFlavor { GW, IC, IU, RD }

object IdeVersions {
    private val commonPlugins = arrayOf(
        "git4idea",
        "org.jetbrains.plugins.terminal",
        "org.jetbrains.plugins.yaml"
    )

    // FIX_WHEN_MIN_IS_223
    private val commonPlugins223 = commonPlugins.map {
        when (it) {
            "git4idea" -> "vcs-git"
            else -> it
        }
    }.toTypedArray()

    private val ideProfiles = listOf(
        Profile(
            name = "2022.2",
            community = ProductProfile(
                sdkFlavor = IdeFlavor.IC,
                sdkVersion = "2022.2",
                plugins = commonPlugins + listOf(
                    "java",
                    "com.intellij.gradle",
                    "org.jetbrains.idea.maven",
                    "PythonCore:222.3345.118",
                    "Docker:222.3345.118"
                )
            ),
            ultimate = ProductProfile(
                sdkFlavor = IdeFlavor.IU,
                sdkVersion = "2022.2",
                plugins = commonPlugins + listOf(
                    "JavaScript",
                    // Transitive dependency needed for javascript
                    // Can remove when https://github.com/JetBrains/gradle-intellij-plugin/issues/608 is fixed
                    "com.intellij.css",
                    "JavaScriptDebugger",
                    "com.intellij.database",
                    "com.jetbrains.codeWithMe",
                    "Pythonid:222.3345.118",
                    "org.jetbrains.plugins.go:222.3345.118",
                    // https://github.com/JetBrains/gradle-intellij-plugin/issues/1056
                    "org.intellij.intelliLang"
                )
            ),
            rider = RiderProfile(
                sdkVersion = "2022.2",
                plugins = commonPlugins + listOf(
                    "rider-plugins-appender" // Workaround for https://youtrack.jetbrains.com/issue/IDEA-179607
                ),
                netFrameworkTarget = "net472",
                rdGenVersion = "2022.2.4",
                nugetVersion = "2022.2.0"
            )
        ),
        Profile(
            name = "2022.3",
            community = ProductProfile(
                sdkFlavor = IdeFlavor.IC,
                // test failure related to null notification contexts in 2022.3
                sdkVersion = "2022.3.1",
                plugins = commonPlugins223 + listOf(
                    "java",
                    "com.intellij.gradle",
                    "org.jetbrains.idea.maven",
                    "PythonCore:223.8214.16",
                    "Docker:223.8214.64"
                )
            ),
            ultimate = ProductProfile(
                sdkFlavor = IdeFlavor.IU,
                sdkVersion = "2022.3.1",
                plugins = commonPlugins223 + listOf(
                    "JavaScript",
                    // Transitive dependency needed for javascript
                    // Can remove when https://github.com/JetBrains/gradle-intellij-plugin/issues/608 is fixed
                    "com.intellij.css",
                    "JavaScriptDebugger",
                    "com.intellij.database",
                    "com.jetbrains.codeWithMe",
                    "Pythonid:223.8214.52",
                    "org.jetbrains.plugins.go:223.8214.52",
                    // https://github.com/JetBrains/gradle-intellij-plugin/issues/1056
                    "org.intellij.intelliLang"
                )
            ),
            rider = RiderProfile(
                sdkVersion = "2022.3.1",
                plugins = commonPlugins223 + listOf(
                    "rider-plugins-appender" // Workaround for https://youtrack.jetbrains.com/issue/IDEA-179607
                ),
                netFrameworkTarget = "net472",
                rdGenVersion = "2022.3.4",
                nugetVersion = "2022.3.1"
            )
        ),
        Profile(
            name = "2023.1",
            gateway = ProductProfile(
                sdkFlavor = IdeFlavor.GW,
                sdkVersion = "231.8109-EAP-CANDIDATE-SNAPSHOT",
                plugins = arrayOf("org.jetbrains.plugins.terminal")
            ),
            community = ProductProfile(
                sdkFlavor = IdeFlavor.IC,
                sdkVersion = "2023.1",
                plugins = commonPlugins223 + listOf(
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
                plugins = commonPlugins223 + listOf(
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
                plugins = commonPlugins223 + listOf(
                    "rider-plugins-appender" // Workaround for https://youtrack.jetbrains.com/issue/IDEA-179607
                ),
                netFrameworkTarget = "net472",
                rdGenVersion = "2023.1.2",
                nugetVersion = "2023.1.0"
            )
        ),
        Profile(
            name = "2023.2",
            gateway = ProductProfile(
                sdkFlavor = IdeFlavor.GW,
                sdkVersion = "232.6734-EAP-CANDIDATE-SNAPSHOT",
                plugins = arrayOf("org.jetbrains.plugins.terminal")
            ),
            community = ProductProfile(
                sdkFlavor = IdeFlavor.IC,
                sdkVersion = "232.6734-EAP-CANDIDATE-SNAPSHOT",
                plugins = commonPlugins223 + listOf(
                    "java",
                    "com.intellij.gradle",
                    "org.jetbrains.idea.maven",
                    "PythonCore:232.6734.9",
                    "Docker:232.6734.4"
                )
            ),
            ultimate = ProductProfile(
                sdkFlavor = IdeFlavor.IU,
                sdkVersion = "232.6734-EAP-CANDIDATE-SNAPSHOT",
                plugins = commonPlugins223 + listOf(
                    "JavaScript",
                    // Transitive dependency needed for javascript
                    // Can remove when https://github.com/JetBrains/gradle-intellij-plugin/issues/608 is fixed
                    "com.intellij.css",
                    "JavaScriptDebugger",
                    "com.intellij.database",
                    "com.jetbrains.codeWithMe",
                    "Pythonid:232.6734.9",
                    "org.jetbrains.plugins.go:232.6734.9",
                    // https://github.com/JetBrains/gradle-intellij-plugin/issues/1056
                    "org.intellij.intelliLang"
                )
            ),
            rider = RiderProfile(
                sdkVersion = "2023.2-EAP2-SNAPSHOT",
                plugins = commonPlugins223 + listOf(
                    "rider-plugins-appender" // Workaround for https://youtrack.jetbrains.com/issue/IDEA-179607
                ),
                netFrameworkTarget = "net472",
                rdGenVersion = "2023.2.1",
                nugetVersion = "2023.2.0-eap02"
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
    val rdGenVersion: String, // https://www.myget.org/feed/rd-snapshots/package/maven/com.jetbrains.rd/rd-gen
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
