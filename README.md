
# Heim’s Syntrometric Agent & Live2D Demo  
[![Live Demo](https://img.shields.io/badge/Live_Demo-Open_Interactive-brightgreen)](https://marko0marky.github.io/syntrometry-agent-live2d/)  
[![GitHub Issues](https://img.shields.io/github/issues/marko0marky/syntrometry-agent-live2d)](https://github.com/marko0marky/syntrometry-agent-live2d/issues)  
[![GitHub Stars](https://img.shields.io/github/stars/marko0marky/syntrometry-agent-live2d?style=social)](https://github.com/marko0marky/syntrometry-agent-live2d/stargazers)  
[![MIT License](https://img.shields.io/github/license/marko0marky/syntrometry-agent-live2d?color=blue)](https://github.com/marko0marky/syntrometry-agent-live2d/blob/main/LICENSE)

> An interactive demo of **Burkhard Heim’s Syntrometric Theory**, blending synthetic cognition with **TensorFlow.js**, **Three.js**, and **Live2D Cubism** to model emotions, beliefs, and 3D concept graphs.

This project transforms abstract theoretical structures into a responsive agent that:
- Models emotional dynamics from text
- Applies cascade abstraction (Strukturkondensation)
- Computes Reflexive Integration Heuristic (RIH)
- Visualizes syntrometric syndromes and concept graphs
- Animates a Live2D avatar based on emotional coherence

---

## 🧠 Features

- **Reflexive Integration Heuristic (RIH):** Quantifies belief system harmony
- **Belief Embedding Network:** Encodes emotions, states, and graphs
- **Cascade Abstraction:** Condenses beliefs into syndromes (L1-L4)
- **Emotion Prediction:** Blends Joy, Fear, Curiosity, Frustration, Calm, Surprise
- **Live2D Avatar:** Reflects emotions and head movements
- **Memory Buffer:** Tracks past beliefs for trust scoring
- **Trust Evaluation:** Measures consistency with prior states
- **Self-Learning:** Dynamically adjusts integration/reflexivity
- **Interactive UI:** Sliders, chat input, state save/load
- **3D Visualization:** Renders concept graphs with Three.js

---

## 🎥 Live Demo

🔗 [Try it now](https://marko0marky.github.io/syntrometry-agent-live2d/)  
🖼️ ![Agent Interaction GIF](Syntrometry.gif)

---

## 🚀 Quick Start

### Requirements
- Modern browser with **WebGL** support
- Internet connection (for CDN dependencies)
- Local HTTP server (to avoid CORS issues)

### Steps
1. Clone the repository:
   ```bash
   git clone https://github.com/marko0marky/syntrometry-agent-live2d.git
   ```
2. Navigate to the project folder:
   ```bash
   cd syntrometry-agent-live2d
   ```
3. Serve the project:
   ```bash
   npx live-server .
   ```
4. Open [http://localhost:8080](http://localhost:8080) in your browser.

---

## 🧩 Cognitive Flow

```mermaid
graph TD
    A[User Input] --> B[Emotional Space]
    B --> C[State + Context]
    C --> D[Belief Embedding]
    D --> E[Cascade Abstraction]
    E --> F[Syndromes L1-L4]
    F --> G[Reflexive Integration]
    G --> H[Coherence Score]
    D --> I[Emotion Prediction]
    I --> J[Live2D Expression]
    H --> K[Self-State Update]
    K --> L[Memory + Trust]
    F --> M[3D Concept Graph]
    H --> N[Metrics Panel]
```

⚠️ View the diagram in GitHub or a Mermaid-compatible Markdown viewer (e.g., VSCode with Mermaid extension).

---

## 💡 Technologies

| Technology | Role |
|------------|------|
| **TensorFlow.js** | Neural networks for belief and emotion modeling |
| **Three.js** | 3D rendering of concept graphs |
| **Pixi.js + Live2D Cubism** | Animated 2D avatar |
| **WebGL** | GPU-accelerated visualizations |
| **HTML5/CSS3** | Responsive interface |
| **ES Modules** | Modular JavaScript structure |

---

## ⚙️ Controls

| Control | Function |
|---------|----------|
| **Integration Slider** | Adjusts belief persistence |
| **Reflexivity Slider** | Modulates adaptability |
| **Chat Input** | Sends text for emotional cues |
| **Save State** | Stores current simulation state |
| **Load State** | Restores saved session |

Controls update the Live2D avatar and graphs in real-time.

---

## 📈 Metrics

| Metric | Description |
|--------|-------------|
| **R (RIH Score)** | Belief system stability (0–1) |
| **A (Affinity)** | Layer connection strength |
| **T (Trust)** | Consistency with past beliefs |
| **CV (Cascade Variance)** | Clarity of abstraction layers |
| **I (Integration)** | Memory stability parameter |
| **Î¨ (Reflexivity)** | Adaptation tendency |
| **F (Emotion)** | Dominant emotion intensity |

---

## 📂 Project Structure

```
syntrometry-agent-live2d/
├── index.html           # Entry point
├── README.md            # Documentation
├── LICENSE              # MIT License
├── Syntrometry.gif      # Demo animation
├── style.css            # Styling
└── js/
    ├── config.js        # Configuration
    ├── utils.js         # Helper functions
    ├── agent.js         # Cognitive logic
    ├── environment.js   # Input processing
    ├── viz-syntrometry.js # 3D graph rendering
    ├── viz-concepts.js  # Graph interactions
    └── viz-live2d.js   # Live2D controls
```

---

## 📉 Roadmap

| Feature | Priority | Status |
|---------|----------|--------|
| Recurrent emotion modeling | High | In Progress |
| Complex expression blending | Medium | Planned |
| Semantic graph zoom | Medium | Researching |
| Anomaly detection visuals | Low | Designing |
| Plugin-based rules | Low | Ideation |

---

## 🤝 Contributing

We welcome contributions from developers passionate about:
- Synthetic cognition
- Emotional AI
- Structural theory
- Live2D/TensorFlow.js

### How to Contribute
1. Fork the repository
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m "Add feature"`
4. Push: `git push origin feature/your-feature`
5. Open a Pull Request

Discuss large changes in an issue first.

---

## ❓ FAQ

<details>
<summary>Why is the Live2D model not loading?</summary>
Ensure you're using a local HTTP server (`npx live-server`) to avoid CORS issues.
</details>

<details>
<summary>Why are emotions not blending?</summary>
Check that `emotionNames.length` matches `EMOTION_DIM` in `config.js`.
</details>

<details>
<summary>Why are there visualization glitches?</summary>
Inspect the console for tensor disposal errors and ensure WebGL is enabled.
</details>

---

## 📄 License

MIT License – free to use, modify, and distribute.  
See [LICENSE](./LICENSE) for details.

---

## 🙏 Acknowledgments

- **Burkhard Heim** for Syntrometric Theory
- **TensorFlow.js**, **Three.js**, **Pixi.js**, and **Live2D** teams
- The heim-theory.com community for preserving Heim’s legacy

---

🌟 **Star this repository** if you’re excited about cognitive AI and interactive visualizations!
```
