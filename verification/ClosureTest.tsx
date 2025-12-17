import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

const ClosureTest = () => {
    const [output, setOutput] = useState("");
    const outputRef = useRef("");

    // Sync ref
    useEffect(() => {
        outputRef.current = output;
    }, [output]);

    useEffect(() => {
        // Setup "socket" listeners
        // This effect has NO dependency on `output`, just like the real App.tsx
        // so `onFinished` closes over the initial `output` ("")

        const onFinished = () => {
            console.log("FINAL CHECK:");
            console.log("State (Stale): \"" + output + "\"");
            console.log("Ref (Fresh): \"" + outputRef.current + "\"");

            if (output === "" && outputRef.current === "Hello World") {
                console.log("SUCCESS: Ref captured data, State did not.");
                document.body.innerHTML = "SUCCESS";
            } else {
                console.log("FAILURE");
                document.body.innerHTML = "FAILURE";
            }
        };

        // Simulate socket events
        setTimeout(() => {
            console.log("Simulating data...");
            setOutput("Hello World");
        }, 100);

        setTimeout(() => {
            console.log("Simulating finish...");
            onFinished();
        }, 500);

    }, []); // Empty deps simulates the issue

    return <div>Testing...</div>;
};

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(<ClosureTest />);
