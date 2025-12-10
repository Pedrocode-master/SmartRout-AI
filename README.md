
🚗 SmartRoute - Sistema de Roteamento Inteligente com IA
> Roteamento otimizado por Inteligência Artificial (LLM) com análise de tráfego, clima em tempo real e arquitetura de nível de produção (resiliência e modularidade).
> 
🏆 O Projeto em Destaque
Este projeto transforma um sistema de rastreamento geoespacial em um motor de decisão inteligente. Utilizando o poder do LLM da Groq para processar constraints complexas (como alertas climáticos, preferências do usuário e dados de tráfego), o SmartRoute é capaz de gerar a rota mais otimizada e segura em tempo real, indo além do simples cálculo de distância mais curta.
🎯 Features e Otimização Inteligente
| Categoria | Funcionalidade | Descrição Sênior |
|---|---|---|
| 🧠 Otimização IA | LLM Groq Integration | Usa um Large Language Model (LLM) da Groq para analisar dinamicamente os dados (clima, tráfego) e as preferências do usuário, otimizando a rota e fornecendo insights preditivos antes da execução. |
| ☁️ Dados Externos | Clima em Tempo Real (OpenWeather) | Integração com OpenWeather para considerar precipitação, vento e temperatura na otimização da rota, priorizando segurança e eficiência. |
| 🚦 Tráfego Live | Análise de Tráfego (TomTom/OpenRouteService) | Utiliza APIs de tráfego para recalcular rotas e desvios em tempo real, evitando congestionamentos e acidentes. |
| 🛡️ Resiliência | Arquitetura Tolerante a Falhas | Implementação de lógica de Circuit Breakers e Graceful Degradation (Fallback) para garantir que o roteamento funcione mesmo que uma API externa (como Clima ou IA) falhe. |
| 🌐 Geolocalização | Geocodificação e Mapeamento | Converte endereços em coordenadas precisas (Geocoding) e exibe dados em um frontend limpo e responsivo (OpenLayers). |
| ✅ Estabilidade | Correção de Race Conditions | Otimização da lógica de backend para gerenciar acessos concorrentes e gravações de dados (CSV Logger), garantindo a integridade dos dados em cenários multiusuário. |
🏗️ Stack Tecnológico
| Camada | Tecnologia | Propósito / Destaque |
|---|---|---|
| Backend | Python 3.10+ (Flask) | Arquitetura modular e leve para rápida execução e deploy. |
| IA/Otimização | Groq (LLM) | Análise de constraints e decisão inteligente de rota. |
| Roteamento | OpenRouteService (ORS) | Cálculo de rotas base com base em OpenStreetMap. |
| Tráfego/Clima | TomTom Traffic / OpenWeather | Fontes de dados externos críticos para otimização. |
| Frontend | JavaScript ES6+, OpenLayers | Visualização geoespacial interativa e performática. |
| Deploy | pyngrok / Google Colab | Ambiente de execução e acesso público instantâneo. |
💻 Estrutura de Código
A arquitetura foi rigidamente modularizada para facilitar a manutenção, os testes unitários e a substituição futura de APIs.
/
├── app.py           # 🚀 Core: Rotas Flask, Servidor, Início do Graceful Degradation
├── config.py        # ⚙️ Configurações (Tokens, API Keys, URLs de Fallback)
├── utils.py         # 💾 Funções: Logger de CSV, Lógica de Circuit Breaker
├── services/        # 🧠 Novo: Módulos específicos para APIs externas
│   ├── ai_optimizer.py    # Lógica de chamada e parse do Groq LLM
│   ├── weather_fetcher.py # Chamada OpenWeather
│   └── route_engine.py    # Orquestração do ORS e TomTom
├── templates/       # HTML (Jinja2)
└── static/          # CSS e JS (Lógica OpenLayers e UI)

💡 Como Executar (Google Colab)
A maneira mais rápida de rodar a aplicação em menos de 5 minutos é usando o Google Colab:
 * Pré-requisitos: Uma conta Google e as chaves de API (Groq, ORS, OpenWeather) configuradas em seu ambiente.
 * Abra o Notebook: Abra o arquivo SETUP_SMART_ROUTE.ipynb (disponível no repositório).
 * Execute as Células: Autorize o mount do Google Drive e execute o script de instalação.
 * Acesso: Clique no link público do ngrok que será fornecido na saída para acessar a aplicação.
🤝 Contribuições
Este projeto está em desenvolvimento contínuo para adicionar recursos como Multi-waypoints (TSP) e Cache Redis. Contribuições são bem-vindas! Abra uma Issue para relatar bugs ou submeta um Pull Request para melhorias

---

🇬🇧 ENGLISH VERSION
🚗 SmartRoute - Intelligent AI Routing System
> Routing optimized by Artificial Intelligence (LLM) with real-time traffic and weather analysis, built with production-level architecture (resilience and modularity).
> 
🏆 Project Highlight
This project evolves a basic geospatial tracking system into an intelligent decision engine. By leveraging the power of Groq's LLM to process complex constraints (such as weather alerts, user preferences, and traffic data), SmartRoute is capable of generating the most optimized and safest route in real-time, going beyond simple shortest-distance calculation.
🎯 Intelligent Features & Optimization
| Category | Feature | Senior-Level Description |
|---|---|---|
| 🧠 AI Optimization | Groq LLM Integration | Uses a Large Language Model (LLM) from Groq to dynamically analyze data (weather, traffic) and user preferences, optimizing the route and providing predictive insights before execution. |
| ☁️ External Data | Real-Time Weather (OpenWeather) | Integration with OpenWeather to factor precipitation, wind, and temperature into route optimization, prioritizing safety and efficiency. |
| 🚦 Live Traffic | Traffic Analysis (TomTom/OpenRouteService) | Utilizes traffic APIs to recalculate routes and detours in real-time, effectively avoiding congestion and incidents. |
| 🛡️ Resilience | Fault-Tolerant Architecture | Implements Circuit Breakers and Graceful Degradation (Fallback) logic to ensure routing functionality even if an external API (like Weather or AI) fails. |
| 🌐 Geolocalization | Geocoding and Mapping | Converts addresses to precise coordinates (Geocoding) and displays data on a clean, responsive frontend (OpenLayers). |
| ✅ Stability | Race Condition Fixes | Backend logic optimization to manage concurrent access and data writing (CSV Logger), ensuring data integrity in multi-user scenarios. |
🏗️ Technology Stack
| Layer | Technology | Purpose / Highlight |
|---|---|---|
| Backend | Python 3.10+ (Flask) | Modular, lightweight architecture for fast execution and deployment. |
| AI/Optimization | Groq (LLM) | Constraint analysis and intelligent route decision-making. |
| Routing | OpenRouteService (ORS) | Baseline route calculation based on OpenStreetMap data. |
| Traffic/Weather | TomTom Traffic / OpenWeather | Critical external data sources for optimization. |
| Frontend | JavaScript ES6+, OpenLayers | Interactive and performant geospatial visualization. |
| Deployment | pyngrok / Google Colab | Execution environment and instant public access. |
💻 Code Structure
The architecture is rigidly modularized to facilitate maintenance, unit testing, and the future replacement of APIs.
/
├── app.py           # 🚀 Core: Flask Routes, Server, Graceful Degradation Init
├── config.py        # ⚙️ Configurations (Tokens, API Keys, Fallback URLs)
├── utils.py         # 💾 Utilities: CSV Logger, Circuit Breaker Logic
├── services/        # 🧠 NEW: Specific modules for external APIs
│   ├── ai_optimizer.py    # Groq LLM calling and parsing logic
│   ├── weather_fetcher.py # OpenWeather calls
│   └── route_engine.py    # ORS and TomTom orchestration
├── templates/       # HTML (Jinja2)
└── static/          # CSS and JS (OpenLayers Logic and UI)

💡 How to Run (Google Colab)
The fastest way to run the application in under 5 minutes is by using Google Colab:
 * Prerequisites: A Google account and configured API keys (Groq, ORS, OpenWeather) in your environment.
 * Open Notebook: Open the SETUP_SMART_ROUTE.ipynb file (available in the repository).
 * Execute Cells: Authorize Google Drive mounting and execute the installation script.
 * Access: Click the public ngrok link provided in the output to access the application.
🤝 Contributions
This project is under continuous development to add features like Multi-waypoints (TSP) and Redis Caching. Contributions are welcome! Feel free to open an Issue to report bugs or submit a Pull Request for enhancements.
O que você deseja fazer agora? Publicar este README no GitHub, ou seguir para o Deploy em Produção (Caminho 1)?
