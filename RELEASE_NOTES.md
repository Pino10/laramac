## New in 0.13.1

### Know when your local AI is working
- **Assistant:** a status bar shows which model server it found, whether the model is loaded, and a **Test** button that sends one short message and shows the answer and how long it took.
- **Tools:** LM Studio, Ollama and vMLX cards show live whether their server is on, how many chat models it has and how many are loaded, with **Test** and **Chat** buttons.
- **Every AI tool explains its buttons** in one line: what Terminal does, what the AI button on a site does, and what to switch on in LM Studio, Ollama or vMLX.
- **vMLX and MLX servers** are found too (ports 8000 and 8080).

### Fixed
- **"The model server answered 400."** LM Studio lists its embedding models (which cannot chat) next to its chat models, and Laramac could pick one. They are now left out, loaded models come first, and a model that cannot answer is swapped for one that can.
- Errors from a model server now say what went wrong and what to do: an embedding model, a model that is not loaded, or a conversation longer than the model's context.
