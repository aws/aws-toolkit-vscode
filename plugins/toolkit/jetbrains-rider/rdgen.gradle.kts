// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import com.jetbrains.rd.generator.gradle.RdGenExtension
import java.io.File

// dupe because gradle can't resolve
buildscript {
    // Cannot be removed or else it will fail to compile
    @Suppress("RemoveRedundantQualifierName")
    val rdversion = software.aws.toolkits.gradle.intellij.IdeVersions.ideProfile(project).rider.rdGenVersion

    repositories {
        val codeArtifactUrl: Provider<String> = providers.environmentVariable("CODEARTIFACT_URL")
        val codeArtifactToken: Provider<String> = providers.environmentVariable("CODEARTIFACT_AUTH_TOKEN")
        if (codeArtifactUrl.isPresent && codeArtifactToken.isPresent) {
            maven {
                url = uri(codeArtifactUrl.get())
                credentials {
                    username = "aws"
                    password = codeArtifactToken.get()
                }
            }
        }
        mavenCentral()
    }

    dependencies {
        classpath("com.jetbrains.rd:rd-gen:$rdversion")
    }
}

// https://github.com/JetBrains/rd/blob/2023.1.2/rd-kt/rd-gen/src/gradlePlugin/kotlin/com/jetbrains/rd/generator/gradle/RdGenTask.kt
open class RdGenTask2 : JavaExec() {
    private val local = extensions.create<RdGenExtension>("params", this)
    private val global = project.extensions.findByType(RdGenExtension::class.java)

    fun rdGenOptions(action: (RdGenExtension) -> Unit) {
        local.apply(action)
    }

    override fun exec() {
        args(generateArgs())

        val files = project.configurations.getByName("rdGenConfiguration").files
        val buildScriptFiles = project.buildscript.configurations.getByName("classpath").files
        val rdFiles: MutableSet<File> = HashSet()
        for (file in buildScriptFiles) {
            if (file.name.contains("rd-")) {
                rdFiles.add(file)
            }
        }
        classpath(files)
        classpath(rdFiles)
        super.exec()
    }

    private fun generateArgs(): List<String?> {
        val effective = local.mergeWith(global!!)
        return effective.toArguments()
    }

    init {
        mainClass.set("com.jetbrains.rd.generator.nova.MainKt")
    }
}

// https://github.com/JetBrains/rd/blob/2023.1.2/rd-kt/rd-gen/src/gradlePlugin/kotlin/com/jetbrains/rd/generator/gradle/RdGenPlugin.kt
class RdGenPlugin2 : Plugin<Project> {
    override fun apply(project: Project) {
        project.extensions.create("rdgen", RdGenExtension::class.java, project)
        project.configurations.create("rdGenConfiguration")
        project.tasks.create("rdgen", RdGenTask2::class.java)

        project.dependencies.run {
            add("rdGenConfiguration", "org.jetbrains.kotlin:kotlin-compiler-embeddable:1.7.0")
            add("rdGenConfiguration", "org.jetbrains.kotlin:kotlin-stdlib:1.7.0")
            add("rdGenConfiguration", "org.jetbrains.kotlin:kotlin-reflect:1.7.0")
            add("rdGenConfiguration", "org.jetbrains.kotlin:kotlin-stdlib-common:1.7.0")
            add("rdGenConfiguration", "org.jetbrains.intellij.deps:trove4j:1.0.20181211")
        }
    }
}

apply<RdGenPlugin2>()
tasks.register<RdGenTask2>("generateModels")
