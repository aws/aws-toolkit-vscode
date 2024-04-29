#  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
#  SPDX-License-Identifier: Apache-2.0
from dataclasses import dataclass
import os

@dataclass
class PluginVariant:
    name: str
    path: str
    gradle_project: str

@dataclass
class IdeVariant:
    pretty: str
    short: str

TEMPLATE = '''<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="Run {plugin.name} - {variant.pretty} [{major_version}]" type="GradleRunConfiguration" factoryName="Gradle" folderName="{major_version}">
    <log_file alias="idea.log" path="$PROJECT_DIR$/plugins/{plugin.path}/build/idea-sandbox/system/log/idea.log" />
    <ExternalSystemSettings>
      <option name="executionName" />
      <option name="externalProjectPath" value="$PROJECT_DIR$" />
      <option name="externalSystemIdString" value="GRADLE" />
      <option name="scriptParameters" value="-PrunIdeVariant={variant.short} -PideProfileName={major_version}" />
      <option name="taskDescriptions">
        <list />
      </option>
      <option name="taskNames">
        <list>
          <option value="{plugin.gradle_project}:runIde" />
        </list>
      </option>
      <option name="vmOptions" />
    </ExternalSystemSettings>
    <ExternalSystemDebugServerProcess>false</ExternalSystemDebugServerProcess>
    <ExternalSystemReattachDebugProcess>true</ExternalSystemReattachDebugProcess>
    <DebugAllEnabled>false</DebugAllEnabled>
    <RunAsTest>false</RunAsTest>
    <method v="2" />
  </configuration>
</component>'''

if __name__ == '__main__':
    mvs = ["2023.2", "2023.3", "2024.1"]
    ides = [
        IdeVariant("Community", "IC"),
        IdeVariant("Rider", "RD"),
        IdeVariant("Ultimate", "IU"),
    ]
    plugins = [
        PluginVariant("Amazon Q", "amazonq", ":plugin-amazonq"),
        PluginVariant("AWS Toolkit", "toolkit/intellij-standalone", ":plugin-toolkit:intellij-standalone"),
        PluginVariant("All", "sandbox-all", ":sandbox-all"),
    ]


    script_root = os.path.abspath(os.path.dirname(__file__))
    for mv in mvs:
        for ide in ides:
            for plugin in plugins:
                with open(os.path.join(script_root, f'Run {plugin.name} - {ide.pretty} [{mv}].run.xml'), 'w') as f:
                    f.write(TEMPLATE.format(plugin = plugin, variant = ide, major_version = mv))
