# Heim's Syntrometric Theory & Live2D Agent Demo

[![Live Demo](https://img.shields.io/badge/Live_Demo-View_Now-brightgreen)](https://marko0marky.github.io/syntrometry-agent-live2d/)
[![GitHub Issues](https://img.shields.io/github/issues/marko0marky/syntrometry-agent-live2d)](https://github.com/marko0marky/syntrometry-agent-live2d/issues)
[![GitHub Stars](https://img.shields.io/github/stars/marko0marky/syntrometry-agent-live2d)](https://github.com/marko0marky/syntrometry-agent-live2d/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Visualize the abstract concepts of Heim's Syntrometric Theory through dynamic 3D simulations and an AI-driven Live2D avatar, bridging theory with interactivity.**

This project presents an interactive web application designed to bring Burkhard Heim's Syntrometric Theory closer to experiential understanding. It combines real-time syntrometric state-space visualizations, an evolving emotional environment, and an expressive Live2D agent.

---

## ✨ Table of Contents

- [🚀 Live Demo & Screenshots](#-live-demo--screenshots)
- [⭐ Features](#-features)
- [📚 Concepts Explored](#-concepts-explored)
- [🛠️ Getting Started](#-getting-started)
- [📂 Project Structure](#-project-structure)
- [💡 Technologies Used](#-technologies-used)
- [📈 Future Enhancements](#-future-enhancements)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)
- [🙏 Acknowledgments](#-acknowledgments)
- [❓ Troubleshooting](#-troubleshooting)

---

## 🚀 Live Demo & Screenshots

**[➡️ View the Live Demo Here](https://marko0marky.github.io/syntrometry-agent-live2d/)**

*(Screenshots & GIFs coming soon!)*

---

## ⭐ Features

- **Real-Time Syntrometry Graph**  
  3D visualization of a 12-dimensional synthetic space, reflexive hierarchy (RIH), and dynamic affinity fields.

- **Interactive Concept Graph**  
  Explore and interact with theoretical constructs of Syntrometric Theory through node-link visualizations.

- **AI-Driven Agent Simulation**  
  Using TensorFlow.js, an agent adapts its emotional states based on environment inputs and structural condensation processes.

- **Expressive Live2D Avatar**  
  The Live2D model mirrors predicted emotions (joy, fear, curiosity, etc.) and corresponding subtle head movements.

- **Metrics and Info Panels**  
  Live display of system metrics: dominant emotion, RIH value, average affinity, and environmental context.

- **Dynamic User Controls**  
  Modify system integration (I(S)) and reflexivity (Ψ) in real-time to influence the simulation.

- **Lightweight Chat Interface**  
  Inject emotional cues into the environment by typing phrases that modify the emotional space.

- **State Persistence**  
  Save and reload simulation states using browser localStorage.

---

## 📚 Concepts Explored

The simulation models and visualizes several Syntrometric Theory concepts, **translated for accessibility**:

- **Syntrometry** — Unified field of abstract and physical interaction via multidimensional systems.
- **Syntrix & Metrons** — The foundational entities of Heim’s structure.
- **Structural Condensation** — Recursive construction of higher-complexity structures from lower-order components.
- **Reflexive Integration Hierarchy (RIH)** — A coherence metric symbolizing internal systemic awareness.
- **Affinities** — Strength of coupling between states across condensation levels.
- **Enyphansyntrix** — Perturbative state transformations simulating discretization and dynamic change.
- **Subjective/Emotional Layer** — Environmental emotional fields influencing agent behavior.

*Note: This implementation is conceptual and intended as an educational exploration rather than a mathematically complete model.*

---

## 🛠️ Getting Started

### Requirements

- Modern Web Browser (Chrome, Firefox, Edge — with WebGL + ES Modules support)
- Internet connection (for CDN asset loading)
- **Recommended**: Run through a local web server to avoid CORS issues (e.g., Python, Node.js http-server, or VSCode Live Server)

### Running Locally

1. **Clone the Repository**

```bash
git clone https://github.com/marko0marky/syntrometry-agent-live2d.git
cd syntrometry-agent-live2d
```

2. **Serve Locally**

- Python 3
  ```bash
  python -m http.server 8000
  ```
- Node.js
  ```bash
  npm install -g http-server
  http-server -p 8000 .
  ```
- VSCode: Install the Live Server extension → Click "Go Live"

Then open your browser to [http://localhost:8000](http://localhost:8000).

---

## 📂 Project Structure

```
syntrometry-agent-live2d/
├── index.html           # Main structure, panels, visualization containers
├── LICENSE
├── README.md
├── style.css            # Styling and responsive layout
├── screenshots/         # Demo screenshots
└── js/
    ├── app.js           # Main application initializer and loop
    ├── config.js        # Constants and parameters
    ├── utils.js         # Common helper utilities
    ├── syntrometry-core.js # Core syntrometric transformations
    ├── agent.js         # The AI agent, emotion prediction, trust adaptation
    ├── environment.js   # Environmental emotion dynamics
    ├── viz-syntrometry.js # 3D Syntrometry visualization
    ├── viz-concepts.js  # Conceptual graph visualization
    └── viz-live2d.js    # Live2D avatar initialization and updates
```

---

## 💡 Technologies Used

| Technology              | Purpose |
| ------------------------ | ------- |
| **HTML5 & CSS3**         | Layout, interface styling |
| **JavaScript (ES Modules)** | Core application architecture |
| **Three.js (r132)**      | 3D Syntrometry and Concept visualizations |
| **TensorFlow.js (4.21.0)** | Neural agent emotion/head motion prediction |
| **Pixi.js (7.3.3)**      | Live2D rendering |
| **Live2D Cubism Core**   | Official SDK runtime for avatar models |
| **pixi-live2d-display (0.4.0)** | Integration of Live2D models into Pixi.js |
| **Google Fonts (Inter)** | Clean and modern typography |

---

## 📈 Future Enhancements

- **Smarter Emotional Dynamics**  
  More nuanced, context-sensitive agent modeling via larger or recurrent networks.

- **Deepened Concept Graph Integration**  
  Dynamic evolution of concepts linked to real-time system states.

- **Cascade-Level Visualization**  
  3D unfolding of the condensation process over time.

- **Natural Language Chatbot**  
  Lightweight on-device language models for richer interactions.

- **Theoretical Fidelity Expansion**  
  Closer mapping to Heim’s original tensor-based syntrometric structures.

- **Live2D Customization Options**  
  Model switching, user-uploaded avatars, real-time facial morphs.

- **Performance Optimizations**  
  Instancing, GPU acceleration improvements for smoother 3D rendering.

---

## 🤝 Contributing

Contributions are warmly welcomed!

1. Fork the repo
2. Create a new branch: `feature/YourFeature`
3. Commit your changes: `git commit -m "feat: Add YourFeature"`
4. Push the branch
5. Open a Pull Request

For larger proposals, please open an issue to discuss first.

---

## 📄 License

Distributed under the **MIT License**.  
See [`LICENSE`](./LICENSE) for details.

---

## 🙏 Acknowledgments

- **Burkhard Heim** — Pioneer of Syntrometric Theory.
- **Live2D Inc.** — For the Cubism SDK and sample models.
- Communities and contributors of **Three.js**, **TensorFlow.js**, and **Pixi.js**.
- Resources at [heim-theory.com](https://heim-theory.com/).

---

## ❓ Troubleshooting

**Live2D Model Won't Load**  
→ Always run with a local server to avoid browser security restrictions (CORS).

**Visualizations Blank**  
→ Check WebGL availability: [get.webgl.org](https://get.webgl.org/).  
→ Check browser console for errors.

**Library CDN Errors**  
→ Ensure an active internet connection and inspect the network tab.

**Performance Drops**  
→ Use a dedicated GPU, close heavy browser tabs, or reduce canvas resolution.

**Other Issues**  
→ Check [GitHub Issues](https://github.com/marko0marky/syntrometry-agent-live2d/issues) or open a new report.

---

🌟 **If you enjoy this project, please consider starring the repository!** 🌟

---
