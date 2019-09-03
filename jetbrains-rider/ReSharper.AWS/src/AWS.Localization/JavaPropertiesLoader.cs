using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using JetBrains.ProjectModel;
using JetBrains.Util;

namespace AWS.Localization
{
    /// <summary>
    /// Simple loader for Java .properties files with localized strings.
    /// Currently, this class is used to get string constants that persists in Java code in localized_messages.properties file.
    /// We would like to use same localized strings to share values between IDEA and R#.
    /// Note: the original .properties file is added to AWS.Localization project as a static resource.
    /// </summary>
    [SolutionComponent]
    public class JavaPropertiesLoader
    {
        private readonly IDictionary<string, string> myLocalizedStrings = new Dictionary<string, string>();

        private readonly object myLock = new object();

        /// <summary>
        /// Get value by key from "localized_messages.properties" Java file.
        /// </summary>
        /// <exception cref="T:System.Collections.Generic.KeyNotFoundException">When key is not found.</exception>
        /// <param name="key">Key to search for</param>
        /// <returns>Value from the "localized_messages.properties" file associated with a provided key.</returns>
        public string GetLocalizedString(string key)
        {
            lock (myLock)
            {
                if (myLocalizedStrings.IsNullOrEmpty())
                {
                    using (var stream = Assembly.GetExecutingAssembly()
                        .GetManifestResourceStream("AWS.Localization.Resources.localized_messages.properties"))
                    {
                        Load(stream);
                    }
                }

                return myLocalizedStrings[key];
            }
        }

        private void Load(Stream stream)
        {
            if (stream.Length == 0) return;
            if (!stream.CanRead) throw new FileLoadException("Unable to read .properties file");

            using (var reader = new StreamReader(stream))
            {
                string line;
                while ((line = reader.ReadLine()?.Trim()) != null)
                {
                    if (line.Length == 0 || line.StartsWith("#") || !line.Contains("=")) continue;

                    // Consider all "="'s after the first match as the part of a value string.
                    var keyValuePair = line.Split('=');
                    myLocalizedStrings[keyValuePair[0]] = string.Join("", keyValuePair.Skip(1));
                }
            }
        }
    }
}
