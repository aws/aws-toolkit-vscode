// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import io.gitlab.arturbosch.detekt.Detekt
import io.gitlab.arturbosch.detekt.DetektCreateBaselineTask
import kotlin.reflect.KVisibility
import kotlin.reflect.full.companionObject
import kotlin.reflect.full.companionObjectInstance
import kotlin.reflect.full.functions
import kotlin.reflect.full.memberFunctions
import kotlin.reflect.full.memberProperties

plugins {
    id("io.gitlab.arturbosch.detekt")
    id("toolkit-testing")
}

// TODO: https://github.com/gradle/gradle/issues/15383
val versionCatalog = extensions.getByType<VersionCatalogsExtension>().named("libs")
dependencies {
    detektPlugins(versionCatalog.findLibrary("detekt-formattingRules").get())
    detektPlugins(project(":detekt-rules"))
}

detekt {
    val rulesProject = project(":detekt-rules").projectDir
    source.setFrom(projectDir)
    buildUponDefaultConfig = true
    parallel = true
    allRules = false
    config.setFrom("$rulesProject/detekt.yml")
    autoCorrect = true
}

tasks.withType<Detekt> {
    reports {
        html.required.set(true) // Human readable report
        xml.required.set(true) // Checkstyle like format for CI tool integrations
    }
}

tasks.withType<DetektCreateBaselineTask> {
    // weird issue where the baseline tasks can't find the source code
    source.plus(projectDir)

    // hack around https://github.com/detekt/detekt/issues/6167
    doLast {
        Class.forName("io.gitlab.arturbosch.detekt.invoke.DetektInvoker").kotlin.let { detektInvoker ->
            val invokerInstance = detektInvoker.companionObject!!.memberFunctions.find { it.name == "create" }!!.call(detektInvoker.companionObjectInstance, false)
            val invokeCliMethod = detektInvoker.memberFunctions.find { it.name == "invokeCli" }
            val jdkHomeArgumentClass = Class.forName("io.gitlab.arturbosch.detekt.invoke.JdkHomeArgument").kotlin
            val jdkHomeArgument = jdkHomeArgumentClass.constructors.first().call(jdkHome)
            val jdkHomeArgs = jdkHomeArgumentClass.memberFunctions.find { it.name == "toArgument" }!!.call(jdkHomeArgument) as List<String>
            val taskArgs = this::class.memberProperties.find { it.name == "arguments" }!!.call(this) as List<String>

            val cliArgs = taskArgs + jdkHomeArgs
            val ignoreFailures = ignoreFailures.getOrElse(false)
            val classpath = detektClasspath.plus(pluginClasspath)
            val taskName = name
            invokeCliMethod!!.call(invokerInstance, cliArgs, classpath, taskName, ignoreFailures)
        }
    }
}
