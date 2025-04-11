/**
 * OrganigramaSimple.js - Biblioteca liviana para generar organigramas con JavaScript nativo
 *
 * Esta biblioteca genera un organigrama jerárquico a partir de un JSON, con líneas
 * de conexión entre supervisor y subordinados ubicadas bajo el cargo de cada persona.
 */

class OrganigramaSimple {
    /**
     * Constructor de la clase OrganigramaSimple
     * @param {Object} config - Configuración del organigrama
     * @param {string} config.container - ID del elemento contenedor donde se renderizará
     * @param {Object} config.data - Datos del organigrama en formato JSON
     * @param {Object} [config.opciones] - Opciones de apariencia y comportamiento
     */
    constructor(config) {
      // Validar configuración básica
      if (!config.container) {
        throw new Error('Se requiere especificar un contenedor');
      }
      if (!config.data) {
        throw new Error('Se requieren datos para generar el organigrama');
      }

      // Obtener el elemento contenedor
      this.container = document.getElementById(config.container);
      if (!this.container) {
        throw new Error(`No se encontró el contenedor con ID '${config.container}'`);
      }

      // Configuración predeterminada
      const opcionesDefault = {
        nodeWidth: 180,          // Ancho de cada nodo
        nodeHeight: 140,         // Alto de cada nodo
        horizontalSpacing: 60,   // Espacio horizontal entre nodos
        verticalSpacing: 80,     // Espacio vertical entre niveles
        avatarSize: 60,          // Tamaño del avatar
        nodeColor: "#4ade80",    // Color de los nodos
        lineColor: "#4ade80",    // Color de las líneas conectoras
        textColor: "#000000",    // Color del texto principal
        subtitleColor: "#6b7280", // Color del subtítulo
        initiallyExpanded: false,  // Estado inicial (expandido/contraído)
        initialVisibleLevels: 1   // Número de niveles jerárquicos visibles inicialmente
      };

      // Combinar opciones predeterminadas con las proporcionadas
      this.opciones = { ...opcionesDefault, ...(config.opciones || {}) };

      // Datos del organigrama
      this.datos = config.data;

      // Datos procesados en formato jerárquico
      this.datosJerarquicos = null;

      // Elemento SVG
      this.svg = null;

      // Mapa para almacenar el estado de expansión de los nodos
      this.nodosExpandidos = new Map();

      // Añadir valores iniciales para las dimensiones del SVG
      this.svgWidth = 800;  // Ancho inicial predeterminado
      this.svgHeight = 600; // Alto inicial predeterminado

      // Inicializar
      this.inicializar();
    }

    /**
     * Inicializa el organigrama
     */
    inicializar() {
      // Procesar los datos
      this.procesarDatos();

      // Calcular dimensiones
      this.calcularDimensiones();

      // Renderizar
      this.renderizar();
    }

    /**
     * Procesa los datos para convertirlos en una estructura jerárquica
     */
    procesarDatos() {
      const datos = this.datos.tree || this.datos;

      // Eliminar duplicados de los datos de entrada basados solo en ID
      const datosUnicos = [];
      const idsVistos = new Set();

      for (const nodo of datos) {
        if (!idsVistos.has(nodo.id)) {
          idsVistos.add(nodo.id);
          datosUnicos.push(nodo);
        }
      }

      // Crear un mapa para buscar nodos por ID
      const mapaDeNodos = new Map();

      // Primera pasada: añadir todos los nodos al mapa
      datosUnicos.forEach(nodo => {
        // Crear una copia del nodo con un array de hijos vacío
        const nodoProcesado = { ...nodo, hijos: [], nivel: 0 };

        // Añadir el nodo al mapa
        mapaDeNodos.set(nodo.id, nodoProcesado);
      });

      // Segunda pasada: construir la jerarquía y determinar niveles
      const nodosRaiz = [];

      datosUnicos.forEach(nodo => {
        const nodoProcesado = mapaDeNodos.get(nodo.id);

        // Si el nodo tiene un padre, añadirlo como hijo de ese padre
        if (nodo.pid && mapaDeNodos.has(nodo.pid)) {
          const nodoPadre = mapaDeNodos.get(nodo.pid);
          nodoProcesado.nivel = nodoPadre.nivel + 1;
          nodoPadre.hijos.push(nodoProcesado);
        } else {
          // Si no tiene padre, es un nodo raíz (nivel 0)
          nodoProcesado.nivel = 0;
          nodosRaiz.push(nodoProcesado);
        }

        // No establecemos aquí el estado de expansión todavía
      });

      // Eliminar duplicados del árbol
      this.eliminarDuplicados(nodosRaiz);

      // Almacenar los datos procesados
      this.datosJerarquicos = nodosRaiz;

      // DESPUÉS de procesado todo el árbol, configurar la expansión inicial
      // IMPORTANTE: Esto asegura que conocemos el nivel correcto de cada nodo
      this.configurarExpansionInicial();
    }

    /**
     * Configura el estado inicial de expansión de los nodos según el nivel jerárquico
     */
    configurarExpansionInicial() {
      // Función recursiva para configurar el estado de expansión
      const configurarExpansion = (nodos, nivel) => {
        nodos.forEach(nodo => {
          // Expandir nodos según el nivel configurado
          const expandido = this.opciones.initiallyExpanded && nivel < this.opciones.initialVisibleLevels;
          this.nodosExpandidos.set(nodo.id, expandido);

          // Si tiene hijos, procesar recursivamente
          if (nodo.hijos && nodo.hijos.length > 0) {
            configurarExpansion(nodo.hijos, nivel + 1);
          }
        });
      };

      // Iniciar desde los nodos raíz (nivel 0)
      configurarExpansion(this.datosJerarquicos, 0);
    }

    /**
     * Elimina nodos duplicados del organigrama
     * @param {Array} nodos - Nodos a procesar
     */
    eliminarDuplicados(nodos) {
      const vistos = new Set();
      const nodosUnicos = [];

      // Función que realmente elimina los duplicados
      const filtrarDuplicados = (nodos) => {
        const nodosUnicos = [];

        for (const nodo of nodos) {
          // Crear un ID único basado en el ID del nodo
          const idUnico = nodo.id.toString();

          // Si no hemos visto este nodo antes, lo incluimos
          if (!vistos.has(idUnico)) {
            vistos.add(idUnico);
            nodosUnicos.push(nodo);

            // Procesar recursivamente los hijos para eliminar duplicados
            if (nodo.hijos && nodo.hijos.length > 0) {
              nodo.hijos = filtrarDuplicados(nodo.hijos);
            }
          }
          // Si ya lo vimos, lo omitimos (es un duplicado)
        }

        return nodosUnicos;
      };

      // Filtrar duplicados en los nodos raíz
      const nodosRaizUnicos = filtrarDuplicados(nodos);

      // Reemplazar los nodos originales con la versión sin duplicados
      nodos.length = 0;
      nodos.push(...nodosRaizUnicos);
    }

    /**
     * Calcula las dimensiones necesarias para el organigrama
     */
    calcularDimensiones() {
      // Calcular la profundidad máxima (número de niveles)
      let profundidadMaxima = 0;

      const calcularProfundidad = (nodo, profundidad) => {
        profundidadMaxima = Math.max(profundidadMaxima, profundidad);

        if (nodo.hijos && nodo.hijos.length > 0 && this.nodosExpandidos.get(nodo.id)) {
          nodo.hijos.forEach(hijo => calcularProfundidad(hijo, profundidad + 1));
        }
      };

      // Solo contar niveles de nodos expandidos
      this.datosJerarquicos.forEach(nodoRaiz => calcularProfundidad(nodoRaiz, 1));

      // Reiniciar estructuras para los cálculos de posición
      this.nodosEnNivel = [];
      this.posicionesNodos = {};

      // Primera pasada: contar el número total de nodos visibles en cada nivel
      // Esto nos ayudará a calcular mejor el espacio necesario
      const conteoNodosPorNivel = [];

      const contarNodosVisiblesPorNivel = (nodo, nivel) => {
        // Asegurarse de que el array para este nivel exista
        if (!conteoNodosPorNivel[nivel]) conteoNodosPorNivel[nivel] = 0;

        // Contar este nodo
        conteoNodosPorNivel[nivel]++;

        // Si tiene hijos y está expandido, contar los hijos en el siguiente nivel
        if (nodo.hijos && nodo.hijos.length > 0 && this.nodosExpandidos.get(nodo.id)) {
          nodo.hijos.forEach(hijo => contarNodosVisiblesPorNivel(hijo, nivel + 1));
        }
      };

      this.datosJerarquicos.forEach(nodo => contarNodosVisiblesPorNivel(nodo, 0));

      // Calcular el ancho mínimo necesario para cada nivel
      const anchosNecesariosPorNivel = conteoNodosPorNivel.map(cantidad =>
        cantidad * (this.opciones.nodeWidth + this.opciones.horizontalSpacing));

      // El ancho total del SVG será el máximo de los anchos necesarios por nivel
      const anchoTotal = Math.max(
        ...anchosNecesariosPorNivel,
        this.datosJerarquicos.length * (this.opciones.nodeWidth + this.opciones.horizontalSpacing) * 2,
        800
      );

      this.svgWidth = anchoTotal;

      // Segunda pasada: asignar posiciones usando un algoritmo de layout de árbol más avanzado
      // Primero, construiremos un árbol temporal que represente solo los nodos visibles
      const construirArbolVisible = (nodos, nivel) => {
        const arbol = { nodos: [], anchoTotal: 0 };

        for (const nodo of nodos) {
          const nodoInfo = {
            nodo,
            hijos: [],
            ancho: this.opciones.nodeWidth,
            nivel,
            posX: 0 // Se calculará después
          };

          // Si tiene hijos y está expandido, construir subárboles
          if (nodo.hijos && nodo.hijos.length > 0 && this.nodosExpandidos.get(nodo.id)) {
            const subArbol = construirArbolVisible(nodo.hijos, nivel + 1);
            nodoInfo.hijos = subArbol.nodos;
            nodoInfo.ancho = Math.max(this.opciones.nodeWidth, subArbol.anchoTotal);
          }

          arbol.nodos.push(nodoInfo);
          arbol.anchoTotal += nodoInfo.ancho + this.opciones.horizontalSpacing;
        }

        if (arbol.anchoTotal > 0) {
          arbol.anchoTotal -= this.opciones.horizontalSpacing; // Quitar el último espacio
        }

        return arbol;
      };

      // Construir el árbol visible
      const arbolVisible = construirArbolVisible(this.datosJerarquicos, 0);

      // Asignar posiciones X a cada nodo usando la función mejorada
      this.asignarPosicionesX(arbolVisible.nodos, this.opciones.horizontalSpacing, 0);

      // Ajustar posiciones para asegurar distancia mínima entre nodos del mismo nivel
      for (let nivel = 0; nivel < this.nodosEnNivel.length; nivel++) {
        const nodos = this.nodosEnNivel[nivel] || [];
        if (nodos.length <= 1) continue; // No hay ajustes necesarios para un solo nodo

        // Ordenar nodos por posición X
        nodos.sort((a, b) => this.posicionesNodos[a.id].x - this.posicionesNodos[b.id].x);

        // Verificar y ajustar las distancias
        for (let i = 1; i < nodos.length; i++) {
          const nodoActual = nodos[i];
          const nodoAnterior = nodos[i-1];
          const distanciaActual = this.posicionesNodos[nodoActual.id].x - this.posicionesNodos[nodoAnterior.id].x;

          // Si la distancia es menor que la mínima, ajustar
          if (distanciaActual < this.opciones.nodeWidth + this.opciones.horizontalSpacing) {
            const ajuste = (this.opciones.nodeWidth + this.opciones.horizontalSpacing) - distanciaActual;

            // Ajustar este nodo y todos los siguientes
            for (let j = i; j < nodos.length; j++) {
              this.posicionesNodos[nodos[j].id].x += ajuste;

              // Si este nodo tiene hijos visibles, moverlos también
              this.ajustarPosicionesSubarbol(nodos[j], ajuste);
            }
          }
        }
      }

      // Calcular el ancho final después de los ajustes
      let xMaxima = 0;
      Object.values(this.posicionesNodos).forEach(pos => {
        xMaxima = Math.max(xMaxima, pos.x + this.opciones.nodeWidth / 2);
      });

      // Establecer dimensiones finales del SVG
      this.svgWidth = Math.max(xMaxima + this.opciones.horizontalSpacing, 800);
      this.svgHeight = Math.max(profundidadMaxima * (this.opciones.nodeHeight + this.opciones.verticalSpacing), 600);
    }

    /**
     * Ajusta las posiciones de todo un subárbol cuando se mueve un nodo
     * @param {Object} nodoPadre - Nodo padre cuya posición cambió
     * @param {number} ajuste - Cantidad de ajuste horizontal
     */
    ajustarPosicionesSubarbol(nodoPadre, ajuste) {
      if (!nodoPadre.hijos || nodoPadre.hijos.length === 0 || !this.nodosExpandidos.get(nodoPadre.id)) {
        return;
      }

      for (const hijo of nodoPadre.hijos) {
        if (this.posicionesNodos[hijo.id]) {
          this.posicionesNodos[hijo.id].x += ajuste;
          this.ajustarPosicionesSubarbol(hijo, ajuste);
        }
      }
    }

    /**
     * Alterna el estado de un nodo (expandido/contraído)
     * @param {number} nodoId - ID del nodo a alternar
     */
    alternarNodo(nodoId) {
      // Obtener el estado actual de expansión
      const estadoActual = this.nodosExpandidos.get(nodoId);

      // Guardar el zoom actual antes de realizar cambios
      const zoomActual = this.escalaActual;
      const translacionXActual = this.translacionX;
      const translacionYActual = this.translacionY;

      // Cambiar al estado opuesto
      this.nodosExpandidos.set(nodoId, !estadoActual);

      // Limpiar las estructuras de posiciones para recalcular desde cero
      this.nodosEnNivel = [];
      this.posicionesNodos = {};

      // Recalcular todo el layout
      this.calcularDimensiones();

      // Volver a renderizar el organigrama
      this.renderizar();

      // Restaurar el nivel de zoom y posición anteriores
      this.escalaActual = zoomActual;
      this.translacionX = translacionXActual;
      this.translacionY = translacionYActual;

      // Actualizar elementos de la interfaz para reflejar el zoom mantenido
      this.deslizadorZoom.value = zoomActual;
      this.etiquetaZoom.textContent = `${Math.round(zoomActual * 100)}%`;
      this.actualizarTransformacion();
    }

    /**
     * Renderiza el organigrama completo
     */
    renderizar() {
      // Limpiar el contenedor
      this.container.innerHTML = '';

      // Crear contenedor para los controles de zoom
      this.crearControlesZoom();

      // Crear el elemento SVG con todos los namespaces necesarios
      this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      this.svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      this.svg.setAttribute('width', '100%');
      this.svg.setAttribute('height', '100%');
      this.svg.setAttribute('viewBox', `0 0 ${this.svgWidth} ${this.svgHeight}`);
      this.svg.setAttribute('class', 'organigrama');

      // Grupo principal que contendrá todo el organigrama y permitirá arrastre
      this.grupoArrastrable = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      this.svg.appendChild(this.grupoArrastrable);

      // Añadir estilos CSS al SVG
      const estilo = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      estilo.textContent = `
        .nodo-organigrama text.nombre {
          font-weight: bold;
          font-size: 14px;
          text-anchor: middle;
          fill: ${this.opciones.textColor};
        }
        .nodo-organigrama text.cargo {
          font-size: 12px;
          text-anchor: middle;
          fill: ${this.opciones.subtitleColor};
        }
        .nodo-organigrama circle.avatar {
          fill: ${this.opciones.nodeColor};
        }
        .nodo-organigrama circle.borde-avatar {
          fill: none;
          stroke: ${this.opciones.nodeColor};
          stroke-width: 2;
        }
        .linea-conexion {
          stroke: ${this.opciones.lineColor};
          stroke-width: 2;
          fill: none;
        }
        .boton-expandir-colapsar {
          cursor: pointer;
        }
        .boton-expandir-colapsar:hover circle.circulo-boton {
          stroke-width: 2;
        }
        .boton-expandir-colapsar:hover text.simbolo-boton {
          font-weight: bolder;
        }
        .circulo-boton {
          fill: white;
          stroke: ${this.opciones.lineColor};
          stroke-width: 1;
        }
        .simbolo-boton {
          fill: ${this.opciones.lineColor};
          font-weight: bold;
          text-anchor: middle;
          dominant-baseline: central;
          pointer-events: none;
        }
        .nodo-organigrama[data-tiene-hijos="true"] {
          cursor: pointer;
        }
        .nodo-organigrama[data-tiene-hijos="true"]:hover circle.avatar {
          fill-opacity: 0.8;
        }
        .nodo-organigrama[data-tiene-hijos="true"]:hover circle.borde-avatar {
          stroke-width: 3;
        }
        .organigrama {
          cursor: grab;
        }
        .organigrama.arrastrando {
          cursor: grabbing;
        }
        .controles-zoom {
          position: absolute;
          bottom: 20px;
          right: 20px;
          background: white;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 5px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
          display: flex;
          align-items: center;
          z-index: 1000;
        }
        .controles-zoom button {
          background: #f5f5f5;
          border: 1px solid #ddd;
          border-radius: 4px;
          width: 30px;
          height: 30px;
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 5px;
        }
        .controles-zoom button:hover {
          background: #e9e9e9;
        }
        .controles-zoom input[type="range"] {
          width: 100px;
          margin: 0 10px;
        }
        .controles-zoom .zoom-valor {
          width: 40px;
          text-align: center;
          font-size: 12px;
        }
      `;
      this.svg.appendChild(estilo);

      // Añadir el SVG al contenedor
      this.container.appendChild(this.svg);

      // Configurar eventos de arrastre
      this.configurarArrastre();

      // Renderizar el organigrama basado en las posiciones calculadas
      this.renderizarOrganigrama();

      // Inicializar transformación
      this.escalaActual = 1;

      // Centrar inicialmente el organigrama en el contenedor
      this.centrarOrganigrama();

      // Actualizar transformación
      this.actualizarTransformacion();
    }

    /**
     * Centra el organigrama en el contenedor
     */
    centrarOrganigrama() {
      // Obtener las dimensiones del contenedor
      const contenedorRect = this.container.getBoundingClientRect();
      const centroContenedorX = contenedorRect.width / 2;
      const centroContenedorY = contenedorRect.height / 2;

      // Si solo hay un nodo raíz, centrar en ese nodo
      if (this.datosJerarquicos.length === 1) {
        const nodoRaizId = this.datosJerarquicos[0].id;
        const nodoRaizInfo = this.posicionesNodos[nodoRaizId];

        if (nodoRaizInfo) {
          // Calcular la posición del nodo raíz
          const nodoRaizX = nodoRaizInfo.x;
          // Usar una posición Y fija y menor para la cabeza del organigrama
          const nodoRaizY = 50; // Posición Y del nodo raíz es siempre 50

          // Calculamos translación para centrar horizontalmente y colocar la cabeza más arriba
          this.translacionX = centroContenedorX - nodoRaizX;
          // Posicionar el nodo raíz a aproximadamente 1/4 del alto del contenedor
          this.translacionY = contenedorRect.height * 0.25 - nodoRaizY;
        } else {
          this.centrarEnSVG();
        }
      } else {
        // Centrar en el SVG completo pero ajustando la posición vertical
        this.translacionX = (contenedorRect.width - this.svgWidth * this.escalaActual) / 2;
        // Colocar el organigrama más arriba (a un cuarto del contenedor)
        this.translacionY = contenedorRect.height * 0.25 - 50;
      }

      // Asegurar que la translación Y nunca sea negativa
      if (this.translacionY < 0) {
        this.translacionY = 20; // Margen mínimo superior
      }
    }

    /**
     * Centra la vista en el SVG completo
     */
    centrarEnSVG() {
      const contenedorRect = this.container.getBoundingClientRect();
      // Calcular la translación para centrar horizontalmente
      this.translacionX = (contenedorRect.width - this.svgWidth * this.escalaActual) / 2;
      // Para la translación vertical, posicionar en 1/4 del contenedor
      this.translacionY = contenedorRect.height * 0.25 - 50;

      // Asegurar que la translación Y nunca sea negativa
      if (this.translacionY < 0) {
        this.translacionY = 20;
      }
    }

    /**
     * Restablece la vista a la posición y zoom iniciales
     */
    restablecerVista() {
      this.escalaActual = 1;
      this.centrarOrganigrama();
      this.deslizadorZoom.value = 1;
      this.etiquetaZoom.textContent = '100%';
      this.actualizarTransformacion();
    }

    /**
     * Crea los controles de zoom
     */
    crearControlesZoom() {
      const contenedorControles = document.createElement('div');
      contenedorControles.className = 'controles-zoom';

      // Configurar el contenedor para que sea compacto
      contenedorControles.style.display = 'flex';
      contenedorControles.style.flexDirection = 'row';
      contenedorControles.style.alignItems = 'center';

      // Botón de zoom out
      const botonZoomOut = document.createElement('button');
      botonZoomOut.innerHTML = '−';
      botonZoomOut.title = 'Reducir';
      botonZoomOut.addEventListener('click', () => this.ajustarZoom(-0.1));

      // Deslizador de zoom
      const deslizadorZoom = document.createElement('input');
      deslizadorZoom.type = 'range';
      deslizadorZoom.min = '0.5';
      deslizadorZoom.max = '2';
      deslizadorZoom.step = '0.1';
      deslizadorZoom.value = '1';
      deslizadorZoom.style.margin = '0 8px';
      deslizadorZoom.addEventListener('input', (e) => this.establecerZoom(parseFloat(e.target.value)));

      // Etiqueta con el valor del zoom
      const valorZoom = document.createElement('span');
      valorZoom.className = 'zoom-valor';
      valorZoom.textContent = '100%';
      valorZoom.style.minWidth = '40px';
      valorZoom.style.textAlign = 'center';
      this.etiquetaZoom = valorZoom;

      // Botón de zoom in
      const botonZoomIn = document.createElement('button');
      botonZoomIn.innerHTML = '+';
      botonZoomIn.title = 'Ampliar';
      botonZoomIn.addEventListener('click', () => this.ajustarZoom(0.1));

      // Botón de restablecer zoom
      const botonReset = document.createElement('button');
      botonReset.innerHTML = '↺';
      botonReset.title = 'Restablecer vista';
      botonReset.addEventListener('click', () => this.restablecerVista());

      // Agregar elementos al contenedor
      contenedorControles.appendChild(botonZoomOut);
      contenedorControles.appendChild(deslizadorZoom);
      contenedorControles.appendChild(valorZoom);
      contenedorControles.appendChild(botonZoomIn);
      contenedorControles.appendChild(botonReset);

      // Almacenar referencias para uso posterior
      this.deslizadorZoom = deslizadorZoom;

      // Asegurar que el contenedor tenga posición relativa para el posicionamiento correcto
      if (getComputedStyle(this.container).position === 'static') {
        this.container.style.position = 'relative';
      }

      // Agregar el contenedor al DOM
      this.container.appendChild(contenedorControles);
    }

    /**
     * Configura los eventos para permitir arrastrar el organigrama
     */
    configurarArrastre() {
      let estaArrastrando = false;
      let puntoInicioX = 0;
      let puntoInicioY = 0;

      // Eventos de mouse
      this.svg.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // Solo botón principal del mouse
          estaArrastrando = true;
          puntoInicioX = e.clientX - this.translacionX;
          puntoInicioY = e.clientY - this.translacionY;
          this.svg.classList.add('arrastrando');
        }
      });

      window.addEventListener('mousemove', (e) => {
        if (estaArrastrando) {
          e.preventDefault();
          this.translacionX = e.clientX - puntoInicioX;
          this.translacionY = e.clientY - puntoInicioY;
          this.actualizarTransformacion();
        }
      });

      window.addEventListener('mouseup', () => {
        estaArrastrando = false;
        this.svg.classList.remove('arrastrando');
      });

      // Eventos táctiles para dispositivos móviles
      this.svg.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          e.preventDefault();
          estaArrastrando = true;
          puntoInicioX = e.touches[0].clientX - this.translacionX;
          puntoInicioY = e.touches[0].clientY - this.translacionY;
          this.svg.classList.add('arrastrando');
        }
      });

      window.addEventListener('touchmove', (e) => {
        if (estaArrastrando && e.touches.length === 1) {
          e.preventDefault();
          this.translacionX = e.touches[0].clientX - puntoInicioX;
          this.translacionY = e.touches[0].clientY - puntoInicioY;
          this.actualizarTransformacion();
        }
      });

      window.addEventListener('touchend', () => {
        estaArrastrando = false;
        this.svg.classList.remove('arrastrando');
      });

      // Evento de rueda del mouse para zoom
      this.svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        this.ajustarZoom(delta);
      });
    }

    /**
     * Actualiza la transformación aplicada al grupo principal para reflejar zoom y posición
     */
    actualizarTransformacion() {
      this.grupoArrastrable.setAttribute('transform', `translate(${this.translacionX},${this.translacionY}) scale(${this.escalaActual})`);
    }

    /**
     * Ajusta el nivel de zoom
     * @param {number} delta - Valor de cambio en el zoom
     */
    ajustarZoom(delta) {
      const nuevoZoom = Math.max(0.5, Math.min(2, this.escalaActual + delta));
      this.establecerZoom(nuevoZoom);
    }

    /**
     * Establece un nivel específico de zoom
     * @param {number} nuevoZoom - Nuevo nivel de zoom
     */
    establecerZoom(nuevoZoom) {
      this.escalaActual = nuevoZoom;
      this.deslizadorZoom.value = nuevoZoom;
      this.etiquetaZoom.textContent = `${Math.round(nuevoZoom * 100)}%`;
      this.actualizarTransformacion();
    }

    /**
     * Renderiza todo el organigrama usando las posiciones calculadas previamente
     */
    renderizarOrganigrama() {
      const alturaPorNivel = this.opciones.nodeHeight + this.opciones.verticalSpacing;

      // Dibujamos primero una estructura que rastree los padres de cada nodo
      // Crear un mapa que asocie cada nodo con su padre
      const mapaPadres = new Map();

      // Función para construir el mapa de padres
      const construirMapaPadres = (nodos, padre = null) => {
        for (const nodo of nodos) {
          if (padre) {
            mapaPadres.set(nodo.id, padre);
          }

          if (nodo.hijos && nodo.hijos.length > 0) {
            construirMapaPadres(nodo.hijos, nodo);
          }
        }
      };

      // Construir el mapa inicial
      construirMapaPadres(this.datosJerarquicos);

      // Antes de dibujar, necesitamos agrupar los nodos por padre para garantizar que las conexiones sean correctas
      const nodosAgrupados = {};

      // Recorrer el mapa de padres y agrupar los hijos por su padre
      mapaPadres.forEach((padre, hijoId) => {
        if (!nodosAgrupados[padre.id]) {
          nodosAgrupados[padre.id] = [];
        }

        // Buscar el nodo hijo completo, no solo su ID
        for (let nivel of this.nodosEnNivel) {
          if (!nivel) continue;
          for (let nodo of nivel) {
            if (nodo.id == hijoId) {
              nodosAgrupados[padre.id].push(nodo);
              break;
            }
          }
        }
      });

      // Para cada padre, dibujamos las conexiones a todos sus hijos
      Object.keys(nodosAgrupados).forEach(padreId => {
        const hijos = nodosAgrupados[padreId];
        if (!hijos.length || !this.nodosExpandidos.get(Number(padreId))) return;

        // Buscar información del padre
        const padreInfo = this.posicionesNodos[padreId];
        if (!padreInfo) return;

        const padreX = padreInfo.x;
        const padreNivel = padreInfo.nivel;
        const padreY = padreNivel * alturaPorNivel + 50;

        // Buscar el nodo padre completo para obtener información adicional
        let nodoPadre;
        for (let nivel of this.nodosEnNivel) {
          for (let nodo of nivel) {
            if (nodo.id == padreId) {
              nodoPadre = nodo;
              break;
            }
          }
          if (nodoPadre) break;
        }
        if (!nodoPadre) return;

        // Obtener la posición del cargo del padre
        const posYCargoPadre = padreY + this.opciones.avatarSize / 2 + this.getTamanoNombre(nodoPadre);

        // Ordenar los hijos por posición X
        hijos.sort((a, b) => this.posicionesNodos[a.id].x - this.posicionesNodos[b.id].x);

        // Obtener información de los hijos
        const hijosInfo = hijos.map(hijo => {
          const hijoInfo = this.posicionesNodos[hijo.id];
          if (!hijoInfo) return null;

          return {
            nodo: hijo,
            x: hijoInfo.x,
            y: hijoInfo.nivel * alturaPorNivel + 50
          };
        }).filter(info => info !== null);

        if (!hijosInfo.length) return;

        // Calcular el punto medio entre el cargo del padre y el avatar del primer hijo
        // Usamos un punto más cercano al hijo para evitar cruces con otros nodos
        const minChildY = Math.min(...hijosInfo.map(info => info.y));
        // const maxChildY = Math.max(...hijosInfo.map(info.y));
        const midpointY = posYCargoPadre + Math.min(
          (minChildY - posYCargoPadre) / 3, // Un tercio de la distancia
          alturaPorNivel / 2 // O la mitad de la altura del nivel, lo que sea menor
        );

        // 1. Línea vertical desde el padre hasta el punto medio
        const parentVerticalLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        parentVerticalLine.setAttribute('class', 'linea-conexion');
        parentVerticalLine.setAttribute('x1', padreX);
        parentVerticalLine.setAttribute('y1', posYCargoPadre + 2); // Justo debajo del cargo
        parentVerticalLine.setAttribute('x2', padreX);
        parentVerticalLine.setAttribute('y2', midpointY);
        this.grupoArrastrable.appendChild(parentVerticalLine);

        // Si hay más de un hijo, dibujar línea horizontal entre el primero y último
        if (hijosInfo.length > 1) {
          const xPrimerHijo = hijosInfo[0].x;
          const xUltimoHijo = hijosInfo[hijosInfo.length - 1].x;

          const lineaHorizontal = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          lineaHorizontal.setAttribute('class', 'linea-conexion');
          lineaHorizontal.setAttribute('x1', xPrimerHijo);
          lineaHorizontal.setAttribute('y1', midpointY);
          lineaHorizontal.setAttribute('x2', xUltimoHijo);
          lineaHorizontal.setAttribute('y2', midpointY);
          this.grupoArrastrable.appendChild(lineaHorizontal);
        }

        // Para cada hijo, dibujar línea vertical desde el punto medio hasta el hijo
        hijosInfo.forEach(hijoInfo => {
          // Usar path en lugar de line para poder dibujar líneas con múltiples segmentos
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('class', 'linea-conexion');

          // Si el hijo está en un nivel muy por debajo, hacemos una línea con segmentos para evitar cruces
          if (hijoInfo.y - midpointY > alturaPorNivel) {
            // Creamos una curva que baja vertical y luego se dobla hacia el nodo hijo
            const d = `M ${hijoInfo.x} ${midpointY} V ${hijoInfo.y - this.opciones.avatarSize / 2}`;
            path.setAttribute('d', d);
          } else {
            // Línea vertical directa para hijos cercanos
            path.setAttribute('d', `M ${hijoInfo.x} ${midpointY} V ${hijoInfo.y - this.opciones.avatarSize / 2}`);
          }

          this.grupoArrastrable.appendChild(path);
        });
      });

      // Luego renderizar todos los nodos
      for (let nivelIdx = 0; nivelIdx < this.nodosEnNivel.length; nivelIdx++) {
        const nodos = this.nodosEnNivel[nivelIdx] || [];
        const posY = nivelIdx * alturaPorNivel + 50; // Posición base Y para este nivel

        nodos.forEach(nodo => {
          const posX = this.posicionesNodos[nodo.id].x;
          this.renderizarNodo(nodo, posX, posY, nivelIdx);
        });
      }
    }

    /**
     * Obtiene el tamaño vertical necesario para el nombre según su longitud
     * @param {Object} nodo - El nodo para calcular el tamaño del nombre
     * @returns {number} - Altura adicional para el nombre
     */
    getTamanoNombre(nodo) {
      const nombre = nodo.name || '';
      const partesNombre = nombre.split(' ');

      // Si el nombre tiene más de 2 palabras, necesita más espacio
      return (partesNombre.length <= 2) ? 40 : 60;
    }

    /**
     * Renderiza un nodo individual
     * @param {Object} nodo - Nodo a renderizar
     * @param {number} x - Posición X del nodo
     * @param {number} y - Posición Y del nodo
     * @param {number} nivel - Nivel del nodo en la jerarquía
     */
    renderizarNodo(nodo, x, y, nivel) {
      // Crear el grupo para el nodo
      const grupoNodo = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      grupoNodo.setAttribute('class', 'nodo-organigrama');
      grupoNodo.setAttribute('data-id', nodo.id);

      // Marcar si tiene hijos para aplicar estilos CSS
      const tieneHijos = nodo.hijos && nodo.hijos.length > 0;
      grupoNodo.setAttribute('data-tiene-hijos', tieneHijos ? 'true' : 'false');

      // Si tiene hijos, hacer que el nodo sea clicable para expandir/contraer
      if (tieneHijos) {
        grupoNodo.addEventListener('click', () => this.alternarNodo(nodo.id));
      }

      // Dibujar el avatar (círculo)
      const circuloAvatar = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circuloAvatar.setAttribute('class', 'avatar');
      circuloAvatar.setAttribute('cx', x);
      circuloAvatar.setAttribute('cy', y);
      circuloAvatar.setAttribute('r', this.opciones.avatarSize / 2);
      grupoNodo.appendChild(circuloAvatar);

      // Añadir imagen de avatar si existe
      if (nodo.img) {
        // En lugar de usar patrones que pueden tener problemas, usamos imagen directa con clip path
        const imagen = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        imagen.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', nodo.img);
        imagen.setAttribute('x', x - this.opciones.avatarSize / 2);
        imagen.setAttribute('y', y - this.opciones.avatarSize / 2);
        imagen.setAttribute('width', this.opciones.avatarSize);
        imagen.setAttribute('height', this.opciones.avatarSize);

        // Creamos un clipPath para hacer la imagen circular
        const clipPathId = `clip-path-${nodo.id}`;
        const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
        clipPath.setAttribute('id', clipPathId);

        const circuloClip = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circuloClip.setAttribute('cx', x);
        circuloClip.setAttribute('cy', y);
        circuloClip.setAttribute('r', this.opciones.avatarSize / 2);
        clipPath.appendChild(circuloClip);

        this.svg.appendChild(clipPath);

        // Aplicamos el clip path a la imagen
        imagen.setAttribute('clip-path', `url(#${clipPathId})`);

        // Añadimos la imagen al grupo del nodo
        grupoNodo.appendChild(imagen);

        // El círculo del avatar será transparente para que se vea la imagen
        circuloAvatar.setAttribute('fill', 'transparent');
      }

      // Añadir borde al círculo
      const bordeAvatar = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      bordeAvatar.setAttribute('class', 'borde-avatar');
      bordeAvatar.setAttribute('cx', x);
      bordeAvatar.setAttribute('cy', y);
      bordeAvatar.setAttribute('r', this.opciones.avatarSize / 2);
      grupoNodo.appendChild(bordeAvatar);

      // Añadir nombre
      const textoNombre = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textoNombre.setAttribute('class', 'nombre');
      textoNombre.setAttribute('x', x);
      textoNombre.setAttribute('y', y + this.opciones.avatarSize / 2 + 20);

      // Dividir el nombre en líneas si es necesario
      const nombre = nodo.name || '';
      const partesNombre = nombre.split(' ');

      if (partesNombre.length <= 2) {
        // Una o dos palabras, mostrar en una línea
        textoNombre.textContent = nombre;
      } else {
        // Más de dos palabras, dividir en dos líneas
        const puntoMedio = Math.ceil(partesNombre.length / 2);
        const primeraParte = partesNombre.slice(0, puntoMedio).join(' ');
        const segundaParte = partesNombre.slice(puntoMedio).join(' ');

        const lineaPrimera = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        lineaPrimera.setAttribute('x', x);
        lineaPrimera.setAttribute('dy', '0');
        lineaPrimera.textContent = primeraParte;
        textoNombre.appendChild(lineaPrimera);

        const lineaSegunda = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        lineaSegunda.setAttribute('x', x);
        lineaSegunda.setAttribute('dy', '1.2em');
        lineaSegunda.textContent = segundaParte;
        textoNombre.appendChild(lineaSegunda);
      }

      grupoNodo.appendChild(textoNombre);

      // Añadir cargo
      const textoCargo = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textoCargo.setAttribute('class', 'cargo');
      textoCargo.setAttribute('x', x);

      // Ajustar posición vertical según el número de líneas del nombre
      const posYCargo = y + this.opciones.avatarSize / 2 + (partesNombre.length <= 2 ? 40 : 60);
      textoCargo.setAttribute('y', posYCargo);

      // Convertir primera letra a mayúsculas
      const cargo = nodo.title || '';
      textoCargo.textContent = cargo.charAt(0).toUpperCase() + cargo.slice(1);

      grupoNodo.appendChild(textoCargo);

      // Añadir el nodo al SVG
      this.grupoArrastrable.appendChild(grupoNodo);

      // Si tiene hijos, añadir el botón de expandir/contraer
      if (tieneHijos) {
        // Añadir indicador visual de expandir/contraer (+ o -) en el centro derecho del avatar
        const posXBoton = x + this.opciones.avatarSize/2 + 5; // Justo a la derecha del avatar
        const posYBoton = y; // Mismo nivel vertical que el centro del avatar
        this.agregarBotonExpandirContraer(nodo, posXBoton, posYBoton);
      }
    }

    /**
     * Añade un botón para expandir/contraer un nodo
     * @param {Object} nodo - Nodo al que añadir el botón
     * @param {number} x - Posición X del botón
     * @param {number} y - Posición Y del botón
     */
    agregarBotonExpandirContraer(nodo, x, y) {
      // Determinar si el nodo está expandido
      const estaExpandido = this.nodosExpandidos.get(nodo.id);

      // Crear grupo para el botón
      const grupoBoton = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      grupoBoton.setAttribute('class', 'boton-expandir-colapsar');
      grupoBoton.setAttribute('data-nodo-id', nodo.id);

      // Círculo del botón con colores distintos para expandir/contraer
      const circuloBoton = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circuloBoton.setAttribute('class', 'circulo-boton');
      circuloBoton.setAttribute('cx', x);
      circuloBoton.setAttribute('cy', y);
      circuloBoton.setAttribute('r', 8); // Tamaño ligeramente reducido para que quede mejor

      // Usar el mismo color para expandir y contraer (verde)
      circuloBoton.style.stroke = this.opciones.nodeColor; // Usar el color de los nodos (verde)
      circuloBoton.style.strokeWidth = '2'; // Borde más grueso para mejor visibilidad

      // Símbolo dentro del botón (+ o -)
      const simboloBoton = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      simboloBoton.setAttribute('class', 'simbolo-boton');
      simboloBoton.setAttribute('x', x);
      simboloBoton.setAttribute('y', y + 1); // Ajuste para centrar mejor el símbolo
      simboloBoton.style.fontSize = '14px'; // Tamaño de fuente ligeramente mayor
      simboloBoton.textContent = estaExpandido ? '-' : '+';

      // Usar el mismo color para el símbolo en ambos estados
      simboloBoton.style.fill = this.opciones.nodeColor; // Usar el color de los nodos (verde)

      // Añadir elementos al grupo
      grupoBoton.appendChild(circuloBoton);
      grupoBoton.appendChild(simboloBoton);

      // Añadir evento de clic con detención de la propagación
      grupoBoton.addEventListener('click', (e) => {
        e.stopPropagation(); // Detener propagación para evitar que se active el clic en el nodo
        this.alternarNodo(nodo.id);
      });

      // Añadir el botón al SVG
      this.grupoArrastrable.appendChild(grupoBoton);
    }

    /**
     * Expande todos los nodos del organigrama
     */
    expandirTodos() {
      this.nodosExpandidos.forEach((valor, clave) => {
        this.nodosExpandidos.set(clave, true);
      });

      // Volver a calcular dimensiones y posiciones
      this.calcularDimensiones();

      // Volver a renderizar
      this.renderizar();
    }

    /**
     * Contrae todos los nodos del organigrama, excepto los configurados como inicialmente visibles
     */
    contraerTodos() {
      // Función recursiva para contraer nodos según nivel
      const contraerPorNivel = (nodos, nivel) => {
        nodos.forEach(nodo => {
          // Si el nivel es mayor o igual que initialVisibleLevels, contraer
          this.nodosExpandidos.set(nodo.id, nivel < this.opciones.initialVisibleLevels);

          // Procesar recursivamente los hijos
          if (nodo.hijos && nodo.hijos.length > 0) {
            contraerPorNivel(nodo.hijos, nivel + 1);
          }
        });
      };

      // Iniciar desde los nodos raíz (nivel 0)
      contraerPorNivel(this.datosJerarquicos, 0);

      // Recalcular y renderizar
      this.calcularDimensiones();
      this.renderizar();
    }

    /**
     * Encuentra un nodo por su ID en la estructura jerárquica
     * @param {number|string} id - ID del nodo a buscar
     * @returns {Object|null} - El nodo encontrado o null si no existe
     */
    encontrarNodoPorId(id) {
      // Función recursiva para buscar en el árbol
      const buscarEnNodos = (nodos) => {
        for (const nodo of nodos) {
          if (nodo.id == id) {
            return nodo;
          }

          if (nodo.hijos && nodo.hijos.length > 0) {
            const encontrado = buscarEnNodos(nodo.hijos);
            if (encontrado) return encontrado;
          }
        }
        return null;
      };

      return buscarEnNodos(this.datosJerarquicos);
    }

    /**
     * Restablece la visualización a los niveles inicialmente configurados
     */
    restablecerNiveles() {
      this.configurarExpansionInicial();
      this.calcularDimensiones();
      this.renderizar();
    }

    /**
     * Actualiza el organigrama con nuevos datos
     * @param {Object} nuevosDatos - Nuevos datos para el organigrama
     */
    actualizar(nuevosDatos) {
      this.datos = nuevosDatos;
      this.datosJerarquicos = null;
      this.nodosExpandidos = new Map();
      this.inicializar();
    }

    /**
     * Ajusta el tamaño del organigrama al contenedor
     */
    redimensionar() {
      this.calcularDimensiones();
      this.renderizar();
    }

    /**
     * Asigna posiciones X a cada nodo
     * @param {Array} arbolNodos - Nodos a posicionar
     * @param {number} posInicioX - Posición inicial X
     * @param {number} nivelActual - Nivel jerárquico actual
     */
    asignarPosicionesX(arbolNodos, posInicioX, nivelActual) {
      // Asegurar que haya un array para este nivel
      if (!this.nodosEnNivel[nivelActual]) {
        this.nodosEnNivel[nivelActual] = [];
      }

      // Calcular el ancho total necesario
      const calcularAnchoTotal = (nodos) => {
        if (nodos.length === 0) return 0;

        let anchoTotal = 0;
        for (const nodo of nodos) {
          // Cada nodo ocupa su ancho más el espaciado
          anchoTotal += this.opciones.nodeWidth + this.opciones.horizontalSpacing;
        }
        // Quitar el último espaciado que sobra
        return anchoTotal - this.opciones.horizontalSpacing;
      };

      // Primera pasada: posicionar todos los hijos
      for (let i = 0; i < arbolNodos.length; i++) {
        const nodoInfo = arbolNodos[i];

        // Agregar este nodo a su nivel correspondiente
        this.nodosEnNivel[nivelActual].push(nodoInfo.nodo);

        // Si el nodo tiene hijos, posicionarlos primero
        if (nodoInfo.hijos && nodoInfo.hijos.length > 0) {
          // Calcular el ancho necesario para los hijos
          const anchoHijos = calcularAnchoTotal(nodoInfo.hijos);

          // Calcular la posición X inicial para los hijos
          let posXHijos = posInicioX;

          // Si hay más espacio en el nodo padre, centrar los hijos
          if (this.opciones.nodeWidth > anchoHijos) {
            posXHijos += (this.opciones.nodeWidth - anchoHijos) / 2;
          }

          // Posicionar los hijos recursivamente
          this.asignarPosicionesX(nodoInfo.hijos, posXHijos, nivelActual + 1);
        }

        // Avanzar la posición de inicio para el siguiente nodo
        posInicioX += this.opciones.nodeWidth + this.opciones.horizontalSpacing;
      }

      // Segunda pasada: ajustar los padres para que estén centrados sobre sus hijos
      for (let i = 0; i < arbolNodos.length; i++) {
        const nodoInfo = arbolNodos[i];

        if (nodoInfo.hijos && nodoInfo.hijos.length > 0) {
          // Encontrar la posición X del hijo más a la izquierda y más a la derecha
          const hijosIds = nodoInfo.hijos.map(h => h.nodo.id);
          const posicionesXHijos = hijosIds.map(id => this.posicionesNodos[id]?.x || 0);

          if (posicionesXHijos.length > 0) {
            const minX = Math.min(...posicionesXHijos);
            const maxX = Math.max(...posicionesXHijos);

            // Colocar el padre exactamente en el centro de sus hijos
            this.posicionesNodos[nodoInfo.nodo.id] = {
              x: (minX + maxX) / 2,
              nivel: nivelActual
            };
          } else {
            // Si no hay hijos posicionados, usar la posición predeterminada
            this.posicionesNodos[nodoInfo.nodo.id] = {
              x: posInicioX - this.opciones.horizontalSpacing - this.opciones.nodeWidth/2 + i * (this.opciones.nodeWidth + this.opciones.horizontalSpacing),
              nivel: nivelActual
            };
          }
        } else {
          // Si no tiene hijos, simplemente posicionarlo
          this.posicionesNodos[nodoInfo.nodo.id] = {
            x: posInicioX - this.opciones.horizontalSpacing - this.opciones.nodeWidth/2 + i * (this.opciones.nodeWidth + this.opciones.horizontalSpacing),
            nivel: nivelActual
          };
        }
      }
    }
  }

  // Exportar la clase
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = OrganigramaSimple;
  } else {
    window.OrganigramaSimple = OrganigramaSimple;
  }
