import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.io.*;
import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import java.security.MessageDigest;

public class ProblematicCode {
    // Critical: Hardcoded credentials
    private static final String DATABASE_PASSWORD = "mySecretPassword123";
    private static final String API_KEY = "sk_live_12345abcdef";
    
    public static void main(String[] args) {
        processUserInput("user input");
    }
    
    public static void processUserInput(String userInput) {
        try {
            // Critical: SQL Injection vulnerability
            Connection conn = DriverManager.getConnection(
                "jdbc:mysql://localhost/db", "admin", DATABASE_PASSWORD);
            Statement stmt = conn.createStatement();
            stmt.execute("SELECT * FROM users WHERE name = '" + userInput + "'");
            
            // High: Command Injection
            Runtime.getRuntime().exec("cmd.exe /c dir " + userInput);
            
            // Critical: Path Traversal
            File file = new File("../../../" + userInput);
            FileInputStream fis = new FileInputStream(file);
            
            // High: Unsafe Deserialization
            ObjectInputStream ois = new ObjectInputStream(
                new FileInputStream("data.ser"));
            Object obj = ois.readObject();
            
            // Critical: HTTP Response Splitting
            String header = "Location: " + userInput;
            System.out.println(header);
            
        } catch (Exception e) {
            // Swallowing exception
        }
    }
    
    public static void processFile(String fileName) throws IOException {
        // High: XML External Entity (XXE)
        javax.xml.parsers.DocumentBuilderFactory factory = 
            javax.xml.parsers.DocumentBuilderFactory.newInstance();
        factory.newDocumentBuilder().parse(new File(fileName));
    }
    
    public static String encryptData(String data) throws Exception {
        // High: Weak Cryptography
        MessageDigest md = MessageDigest.getInstance("MD5");
        byte[] hash = md.digest(data.getBytes());
        return new String(hash);
    }
    
    public static void writeToLog(String userInput) {
        try {
            // High: Log Injection
            System.err.println("User activity: " + userInput);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}

