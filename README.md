Heim's Syntrometric Theory & Live2D Agent Demo
[![GitHub Issues](https://img.shields.io/github/issues//)](https://github.com///issues)[![GitHub Stars](https://img.shields.io/github/stars//)](https://github.com///stargazers)
A dynamic web application that brings Heim's Syntrometric Theory to life through interactive 3D visualizations and an AI-driven Live2D avatar. Explore complex system dynamics via a Syntrometry state graph, a concept map, and a responsive agent reflecting emotional states in real-time.
Table of Contents

✨ Features
📚 Concepts Explored
▶️ Demo
🚀 Getting Started
📂 Project Structure
🔧 Technologies Used
💡 Future Enhancements
👋 Contributing
📄 License
🙏 Acknowledgments
❓ Troubleshooting

✨ Features

Syntrometry State Visualization: A 3D graph powered by Three.js, displaying 12 abstract dimensions, Reflexive Integration Hierarchy (RIH) scores, and affinities, updated dynamically based on simulation parameters.
Concept Graph Visualization: An interactive 3D concept map showcasing relationships between Syntrometric constructs, with hover tooltips and click-to-focus functionality.
AI Agent Simulation: A TensorFlow.js-based agent processes environmental states, computes RIH and affinities, and predicts emotional states and head movements.
Live2D Avatar Integration: A Live2D avatar (Hiyori model) mirrors the agent’s emotions (e.g., Joy, Fear) and head movements (nod, shake), enhancing user engagement.
Real-time Metrics Panel: Displays RIH score, average affinity, dominant emotion, and simulation context for immediate feedback.
Interactive Controls: Sliders adjust Integration and Reflexivity parameters, directly influencing the simulation’s behavior.
Chat Interface: Users can input text to influence the environment’s emotional state, with the agent responding dynamically.

📚 Concepts Explored
This demo offers an accessible, interactive interpretation of Heim's Syntrometric Theory, focusing on:

Syntrometry: A framework for modeling complex systems through higher-dimensional interactions.
Syntrix / Metrons: Core structural units and their elemental components.
Structural Condensation: Recursive processes that build complex structures from simpler elements.
Reflexive Integration Hierarchy (RIH): A metric of system coherence based on internal correlations.
Affinities: Measures of similarity between structural components.
Enyphansyntrix: State transformation processes within the system.

Note: This is a conceptual demonstration and not a mathematically rigorous implementation of the full theory.
▶️ Demo
[Link to Live Demo](https://marko0marky.github.io/syntrometry-agent-live2d/))
  
Replace placeholders with actual screenshots or a short demo video for visual appeal.
🚀 Getting Started
Follow these steps to run the project locally. A modern web browser (e.g., Chrome, Firefox) with WebGL and ES Module support is required.
Prerequisites

Node.js (optional, for local server setup).
A web browser with WebGL enabled.
Internet connection (for loading CDN-hosted libraries like TensorFlow.js and Three.js).

Installation

Clone the repository:git clone https://github.com/<Your GitHub Username>/<Your Repository Name>.git


Navigate to the project directory:cd <Your Repository Name>


Serve the project:
Option 1: Simple file accessOpen index.html directly in your browser. Note: Some features (e.g., Live2D model loading) may fail due to CORS restrictions.
Option 2: Local web server (recommended)Use a local server to avoid CORS issues:
With Python:python -m http.server 8000


With Node.js (e.g., using http-server):npm install -g http-server
http-server -p 8000


With VS Code: Use the "Live Server" extension.


Access the app at http://localhost:8000 in your browser.



📂 Project Structure
The project is organized for modularity and maintainability:
<Your Repository Name>/
├── index.html           # Main HTML file with UI and visualization containers
├── LICENSE              # MIT License file
├── README.md            # Project documentation
├── screenshots/         # Folder for demo images or videos
│   ├── syntrometry.png
│   ├── concept-graph.png
│   └── live2d-agent.png
└── js/                  # JavaScript modules
    ├── app.js           # Orchestrates initialization and animation loop
    ├── config.js        # Configuration (emotions, dimensions, simulation parameters)
    ├── utils.js         # Utility functions (tensor creation, clamping, error handling)
    ├── syntrometry-core.js # Implements core Syntrometric concepts
    ├── agent.js         # SyntrometricAgent class for AI logic
    ├── environment.js   # EmotionalSpace class for simulation state
    ├── viz-syntrometry.js # Three.js logic for Syntrometry visualization
    ├── viz-concepts.js  # Three.js logic for Concept Graph visualization
    └── viz-live2d.js    # Pixi.js and Live2D integration

🔧 Technologies Used

HTML5, CSS3, JavaScript (ES Modules): Foundation of the web application.
Three.js: Powers 3D visualizations for Syntrometry and Concept Graph panels.
OrbitControls.js: Enables interactive camera controls.
CSS2DRenderer.js: Renders HTML labels in 3D scenes.


TensorFlow.js: Drives the agent’s emotion and head movement prediction models.
Pixi.js: Facilitates 2D rendering for the Live2D avatar.
Live2D Cubism Core: Core engine for Live2D model rendering.
pixi-live2d-display: Bridges Live2D models with Pixi.js.
Google Fonts (Inter): Provides clean, modern typography.

💡 Future Enhancements

Advanced Agent Models: Integrate pre-trained TensorFlow.js models for more nuanced emotional responses.
Dynamic Environment: Add complex events and user-configurable simulation scenarios.
Enhanced Interactivity: Enable clicking on visualization elements (e.g., cascade layers) for detailed insights.
Expanded Concept Graph: Include more concepts and dynamic updates based on simulation state.
Custom Live2D Models: Allow users to upload or select different Live2D models.
State Persistence: Implement save/load functionality for simulation states.
Mobile Optimization: Improve responsiveness and touch controls for mobile devices.
Theoretical Fidelity: Deepen the connection to Syntrometric Theory with more rigorous mathematical modeling.

👋 Contributing
We welcome contributions to enhance this project! To contribute:

Fork the repository.
Create a feature branch:git checkout -b feature/YourFeature


Commit changes using Conventional Commits:git commit -m "feat: add YourFeature description"


Push to your branch:git push origin feature/YourFeature


Open a Pull Request with a clear description of your changes.

Please ensure code follows the existing style and includes comments for clarity.
📄 License
This project is licensed under the MIT License. See the LICENSE file for details.
If you haven’t added a LICENSE file, create one via GitHub’s interface or include a standard MIT License.
🙏 Acknowledgments

Live2D Co., Ltd.: For the Cubism SDK and Hiyori sample model used in this demo.
Burkhard Heim: For pioneering Syntrometric Theory, inspiring this interactive exploration.
Norbert Wiener: For foundational work in Cybernetics, influencing systems thinking.
Three.js, TensorFlow.js, and Pixi.js Communities: For robust libraries enabling this project.

❓ Troubleshooting

CORS Issues with Live2D Model:
Ensure you’re running the project via a local web server (e.g., python -m http.server) to load external assets correctly.


Library Loading Failures:
Check your internet connection, as the app relies on CDN-hosted libraries (TensorFlow.js, Three.js, etc.).
Verify the CDN URLs in index.html are accessible and up-to-date.


Performance Issues:
Use a modern browser with WebGL support.
Reduce the browser window size or disable animations for low-end devices.


TensorFlow.js Errors:
Ensure WebGL is enabled in your browser.
If errors persist, check the console for specific messages and report them in an issue.


General Bugs:
Open an issue on GitHub with details (browser, OS, error messages, steps to reproduce).



For additional support, check the [Issues](https://github.com///issues) page or create a new issue.

Star the repository if you find this project interesting! 🌟 Contributions and feedback are greatly appreciated.
