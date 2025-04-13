/**
 * OrganigramaSimple.js - Lightweight library to generate organizational charts with native JavaScript
 *
 * This library generates a hierarchical organizational chart from JSON, with connection lines
 * between supervisors and subordinates placed under each person's position.
 */

class SimpleOrgChart {
    /**
     * SimpleOrgChart class constructor
     * @param {Object} config - Chart configuration
     * @param {string} config.container - ID of the container element where the chart will be rendered
     * @param {Object} config.data - Chart data in JSON format
     * @param {Object} [config.options] - Appearance and behavior options
     */
    constructor(config) {
      // Validate basic configuration
      if (!config.container) {
        throw new Error('A container must be specified');
      }
      if (!config.data) {
        throw new Error('Data is required to generate the chart');
      }

      // Get container element
      this.container = document.getElementById(config.container);
      if (!this.container) {
        throw new Error(`Container with ID '${config.container}' not found`);
      }

      // Default configuration
      const defaultOptions = {
        nodeWidth: 180,
        nodeHeight: 140,
        horizontalSpacing: 60,
        verticalSpacing: 80,
        avatarSize: 60,
        nodeColor: "#4ade80",
        lineColor: "#4ade80",
        textColor: "#000000",
        subtitleColor: "#6b7280",
        initiallyExpanded: false,
        initialVisibleLevels: 1,
        width: '100%',
        height: '100%',
        sortBy: 'name', // Nueva opción para ordenar el árbol: 'name', 'title', 'id', 'custom'
        sortDirection: 'asc', // 'asc' o 'desc'
        sortFunction: null, // Función personalizada para ordenar
        showSortControls: false, // Mostrar controles de ordenación
      };

      // Merge default options with provided ones
      this.options = { ...defaultOptions, ...(config.options || {}) };

      // Chart data
      this.data = config.data;

      // Processed data in hierarchical format
      this.hierarchicalData = null;

      // SVG element
      this.svg = null;

      // Map to store node expansion state
      this.expandedNodes = new Map();

      // Add initial values for SVG dimensions
      this.svgWidth = 800;  // Default initial width
      this.svgHeight = 600; // Default initial height

      // Initialize
      this.initialize();
    }

    /**
     * Initializes the organizational chart
     */
    initialize() {
      // Process data
      this.processData();

      // Calculate dimensions
      this.calculateDimensions();

      // Render
      this.render();

      // Centrar el organigrama en el contenedor después de la renderización
      this.centerOrgChart();
    }

    /**
     * Processes data to convert it into a hierarchical structure
     */
    processData() {
      const data = this.data.tree || this.data;

      // Remove duplicates from input data based on ID only
      const uniqueData = [];
      const seenIds = new Set();

      for (const node of data) {
        if (!seenIds.has(node.id)) {
          seenIds.add(node.id);
          uniqueData.push(node);
        }
      }

      // Create a map to look up nodes by ID
      const nodeMap = new Map();

      // First pass: add all nodes to the map
      uniqueData.forEach(node => {
        // Create a copy of the node with an empty children array
        const processedNode = { ...node, children: [], level: 0 };

        // Add the node to the map
        nodeMap.set(node.id, processedNode);
      });

      // Second pass: build the hierarchy and determine levels
      const rootNodes = [];

      uniqueData.forEach(node => {
        const processedNode = nodeMap.get(node.id);

        // If the node has a parent, add it as a child of that parent
        if (node.pid && nodeMap.has(node.pid)) {
          const parentNode = nodeMap.get(node.pid);
          processedNode.level = parentNode.level + 1;
          parentNode.children.push(processedNode);
        } else {
          // If it has no parent, it's a root node (level 0)
          processedNode.level = 0;
          rootNodes.push(processedNode);
        }
      });

      // Remove duplicates from the tree
      this.removeDuplicates(rootNodes);

      // Sort all nodes at every level of the tree consistently
      const sortAllLevels = (nodes, level) => {
        // First sort this level
        this.sortNodes(nodes, level);

        // Then recursively sort all children
        for (const node of nodes) {
          if (node.children && node.children.length > 0) {
            sortAllLevels(node.children, level + 1);
          }
        }
      };

      // Apply sorting to all levels of the tree
      sortAllLevels(rootNodes, 0);

      // Store processed data
      this.hierarchicalData = rootNodes;

      // AFTER processing the entire tree, configure initial expansion
      this.configureInitialExpansion();
    }

    /**
     * Configures the initial expansion state of nodes according to hierarchical level
     */
    configureInitialExpansion() {
      // Recursive function to configure expansion state
      const configureExpansion = (nodes, level) => {
        nodes.forEach(node => {
          // Expand nodes according to configured level
          const expanded = this.options.initiallyExpanded && level < this.options.initialVisibleLevels;
          this.expandedNodes.set(node.id, expanded);

          // If it has children, process recursively
          if (node.children && node.children.length > 0) {
            configureExpansion(node.children, level + 1);
          }
        });
      };

      // Start from root nodes (level 0)
      configureExpansion(this.hierarchicalData, 0);
    }

    /**
     * Removes duplicate nodes from the organizational chart
     * @param {Array} nodes - Nodes to process
     */
    removeDuplicates(nodes) {
      const seen = new Set();
      const uniqueNodes = [];

      // Function that actually removes duplicates
      const filterDuplicates = (nodes) => {
        const uniqueNodes = [];

        for (const node of nodes) {
          // Create a unique ID based on the node ID
          const uniqueId = node.id.toString();

          // If we haven't seen this node before, include it
          if (!seen.has(uniqueId)) {
            seen.add(uniqueId);
            uniqueNodes.push(node);

            // Process children recursively to remove duplicates
            if (node.children && node.children.length > 0) {
              node.children = filterDuplicates(node.children);
            }
          }
          // If we've seen it already, skip it (it's a duplicate)
        }

        return uniqueNodes;
      };

      // Filter duplicates from root nodes
      const uniqueRootNodes = filterDuplicates(nodes);

      // Replace original nodes with the deduplicated version
      nodes.length = 0;
      nodes.push(...uniqueRootNodes);
    }

    /**
     * Calculates the necessary dimensions for the organizational chart
     */
    calculateDimensions() {
      // Calculate maximum depth (number of levels)
      let maxDepth = 0;

      const calculateDepth = (node, depth) => {
        maxDepth = Math.max(maxDepth, depth);

        if (node.children && node.children.length > 0 && this.expandedNodes.get(node.id)) {
          node.children.forEach(child => calculateDepth(child, depth + 1));
        }
      };

      // Only count levels of expanded nodes
      this.hierarchicalData.forEach(rootNode => calculateDepth(rootNode, 1));

      // Reset structures for position calculations
      this.nodesAtLevel = [];
      this.nodePositions = {};

      // First pass: count the total number of visible nodes at each level
      // This will help us better calculate the necessary space
      const nodeCountByLevel = [];

      const countVisibleNodesByLevel = (node, level) => {
        // Ensure the array for this level exists
        if (!nodeCountByLevel[level]) nodeCountByLevel[level] = 0;

        // Count this node
        nodeCountByLevel[level]++;

        // If it has children and is expanded, count the children at the next level
        if (node.children && node.children.length > 0 && this.expandedNodes.get(node.id)) {
          node.children.forEach(child => countVisibleNodesByLevel(child, level + 1));
        }
      };

      this.hierarchicalData.forEach(node => countVisibleNodesByLevel(node, 0));

      // Calculate the minimum width needed for each level considering additional spacing
      // for nodes with many children
      const widthsNeededByLevel = nodeCountByLevel.map((count, level) => {
        // Base space for nodes
        let baseSpace = count * (this.options.nodeWidth + this.options.horizontalSpacing);

        // Additional space for levels with many nodes
        if (count > 5) {
          baseSpace += this.options.horizontalSpacing * 2; // Add extra space
        }

        return baseSpace;
      });

      // The total width of the SVG will be the maximum of the widths needed by level
      // plus an additional margin for better visualization
      const totalWidth = Math.max(
        ...widthsNeededByLevel,
        this.hierarchicalData.length * (this.options.nodeWidth + this.options.horizontalSpacing) * 2,
        800
      ) + this.options.horizontalSpacing * 2;

      this.svgWidth = totalWidth;

      // Second pass: assign positions using a more advanced tree layout algorithm
      // First, we'll build a temporary tree that represents only the visible nodes
      const buildVisibleTree = (nodes, level) => {
        const tree = { nodes: [], totalWidth: 0 };

        // Do not process if there are no nodes
        if (!nodes || nodes.length === 0) {
          return tree;
        }

        for (const node of nodes) {
          // Calculate the space needed for this node based on how many children it has
          let nodeSpace = this.options.nodeWidth;

          const nodeInfo = {
            node,
            children: [],
            width: nodeSpace,
            level,
            posX: 0 // Will be calculated later
          };

          // If it has children and is expanded, build subtrees
          if (node.children && node.children.length > 0 && this.expandedNodes.get(node.id)) {
            const subtree = buildVisibleTree(node.children, level + 1);
            nodeInfo.children = subtree.nodes;

            // The width of the node must be at least the total width of its children
            // to ensure connections are drawn correctly
            const minWidth = Math.max(nodeSpace, subtree.totalWidth);
            nodeInfo.width = minWidth;

            // Add a small additional margin for nodes with many children
            if (node.children.length > 3) {
              nodeInfo.width += this.options.horizontalSpacing * 0.5;
            }
          }

          tree.nodes.push(nodeInfo);
          tree.totalWidth += nodeInfo.width + this.options.horizontalSpacing;
        }

        if (tree.totalWidth > 0) {
          tree.totalWidth -= this.options.horizontalSpacing; // Remove the last space
        }

        return tree;
      };

      // Build the visible tree
      const visibleTree = buildVisibleTree(this.hierarchicalData, 0);

      // Assign X positions to each node using the improved function
      this.assignXPositions(visibleTree.nodes, this.options.horizontalSpacing, 0);

      // Adjust positions to ensure minimum distance between nodes at the same level
      for (let level = 0; level < this.nodesAtLevel.length; level++) {
        const nodes = this.nodesAtLevel[level] || [];
        if (nodes.length <= 1) continue; // No adjustments needed for a single node

        // Sort nodes by X position
        nodes.sort((a, b) => this.nodePositions[a.id].x - this.nodePositions[b.id].x);

        // Check and adjust distances
        for (let i = 1; i < nodes.length; i++) {
          const currentNode = nodes[i];
          const previousNode = nodes[i-1];
          const currentDistance = this.nodePositions[currentNode.id].x - this.nodePositions[previousNode.id].x;

          // If the distance is less than the minimum, adjust
          if (currentDistance < this.options.nodeWidth + this.options.horizontalSpacing) {
            const adjustment = (this.options.nodeWidth + this.options.horizontalSpacing) - currentDistance;

            // Adjust this node and all subsequent nodes
            for (let j = i; j < nodes.length; j++) {
              this.nodePositions[nodes[j].id].x += adjustment;

              // If this node has visible children, move them as well
              this.adjustSubtreePositions(nodes[j], adjustment);
            }
          }
        }
      }

      // Calculate the final width after adjustments
      let maxX = 0;
      Object.values(this.nodePositions).forEach(pos => {
        maxX = Math.max(maxX, pos.x + this.options.nodeWidth / 2);
      });

      // Set final SVG dimensions
      this.svgWidth = Math.max(maxX + this.options.horizontalSpacing, 800);
      this.svgHeight = Math.max(maxDepth * (this.options.nodeHeight + this.options.verticalSpacing), 600);

      // Adjust SVG size to ensure there is enough space
      this.adjustSVGSize();
    }

    /**
     * Adjusts the size of the SVG based on visible nodes
     */
    adjustSVGSize() {
      // Find the most extreme limits of the nodes
      let minX = Infinity;
      let maxX = -Infinity;
      let maxLevel = 0;

      // Find the necessary width by examining all node positions
      Object.values(this.nodePositions).forEach(pos => {
        minX = Math.min(minX, pos.x - this.options.nodeWidth/2);
        maxX = Math.max(maxX, pos.x + this.options.nodeWidth/2);
        maxLevel = Math.max(maxLevel, pos.level);
      });

      // If there are no nodes, keep default sizes
      if (minX === Infinity || maxX === -Infinity) {
        minX = 0;
        maxX = 800;
      }

      // Add margin
      const horizontalMargin = this.options.horizontalSpacing * 2;
      const newWidth = maxX - minX + horizontalMargin;

      // Calculate height based on the deepest level
      const newHeight = (maxLevel + 1) * (this.options.nodeHeight + this.options.verticalSpacing) + 100;

      // Update SVG dimensions
      this.svgWidth = Math.max(newWidth, 800);
      this.svgHeight = Math.max(newHeight, 600);

      // Update the SVG viewBox if it already exists
      if (this.svg) {
        this.svg.setAttribute('viewBox', `0 0 ${this.svgWidth} ${this.svgHeight}`);
      }
    }

    /**
     * Toggles the state of a node (expanded/collapsed)
     * @param {number} nodeId - ID of the node to toggle
     */
    toggleNode(nodeId) {
      // Get current expansion state
      const currentState = this.expandedNodes.get(nodeId);

      // Save current viewport center before making changes
      const containerRect = this.container.getBoundingClientRect();
      const viewportCenterX = containerRect.width / 2;
      const viewportCenterY = containerRect.height / 2;

      // Guardar posición exacta del nodo antes de cualquier cambio
      const oldNodePosition = this.nodePositions[nodeId];

      // Change to opposite state
      this.expandedNodes.set(nodeId, !currentState);

      // If we're expanding a node that previously had no visible children,
      // mark its immediate children as expanded as well
      if (!currentState) {
        const currentNode = this.findNodeById(nodeId);
        if (currentNode && currentNode.children && currentNode.children.length > 0) {
          // Ordenar los hijos según el criterio actual antes de mostrarlos
          this.sortNodes(currentNode.children, currentNode.level + 1);

          // Make sure immediate children are visible
          currentNode.children.forEach(child => {
            // Only set if it doesn't have a value yet
            if (!this.expandedNodes.has(child.id)) {
              this.expandedNodes.set(child.id, false); // Collapsed by default
            }
          });
        }
      }

      // Clear position structures to recalculate from scratch
      this.nodesAtLevel = [];
      this.nodePositions = {};

      // Recalculate the entire layout
      this.calculateDimensions();

      // Re-render the organizational chart
      this.render();

      // Calcular el cambio en la posición del nodo clickeado
      const newPosition = this.nodePositions[nodeId];

      if (newPosition && oldNodePosition) {
        // Calculamos la diferencia en posición para mantener el nodo en el mismo lugar visualmente
        const deltaX = newPosition.x - oldNodePosition.x;

        // Ajustamos la traducción para compensar el cambio de posición
        this.translationX -= deltaX * this.currentScale;

        // Auto-ajustar el zoom cuando sea necesario para mostrar todo el contenido
        this.autoAdjustZoom();

        // Asegurarnos que los límites del organigrama son visibles
        this.ensureChartIsVisible();
      } else {
        // Si no tenemos posiciones anteriores para comparar, centramos y ajustamos el zoom
        this.centerChart();
        this.autoAdjustZoom();
      }

      // Actualizar la transformación para reflejar los cambios
      this.updateTransformation();
    }

    /**
     * Ajusta automáticamente el nivel de zoom para mostrar todo el contenido
     * con un margen razonable
     */
    autoAdjustZoom() {
      // Obtener dimensiones del contenedor
      const containerRect = this.container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;

      // Obtener dimensiones del organigrama
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;

      // Encontrar los límites del organigrama visible
      Object.values(this.nodePositions).forEach(pos => {
        const nodeLeft = pos.x - this.options.nodeWidth/2;
        const nodeRight = pos.x + this.options.nodeWidth/2;
        const nodeTop = pos.level * (this.options.nodeHeight + this.options.verticalSpacing) + 50 - this.options.nodeHeight/2;
        const nodeBottom = nodeTop + this.options.nodeHeight;

        minX = Math.min(minX, nodeLeft);
        maxX = Math.max(maxX, nodeRight);
        minY = Math.min(minY, nodeTop);
        maxY = Math.max(maxY, nodeBottom);
      });

      // Si no hay nodos visibles, salir
      if (minX === Infinity) return;

      // Añadir margen a las dimensiones
      const margin = 50;
      minX -= margin;
      maxX += margin;
      minY -= margin;
      maxY += margin;

      // Calcular dimensiones totales del contenido
      const contentWidth = maxX - minX;
      const contentHeight = maxY - minY;

      // Calcular ratios de zoom necesarios para ajustar horizontal y verticalmente
      const horizontalZoom = containerWidth / contentWidth;
      const verticalZoom = containerHeight / contentHeight;

      // Usar el zoom más restrictivo (el menor) para asegurar que todo sea visible
      let newZoom = Math.min(horizontalZoom, verticalZoom);

      // Limitar el zoom a un rango razonable
      newZoom = Math.max(0.5, Math.min(newZoom, 1.5));

      // Aplicar el nuevo zoom sólo si es significativamente diferente al actual
      if (Math.abs(newZoom - this.currentScale) > 0.1) {
        // Ajustar la posición para mantener centrado el contenido
        const centerX = minX + contentWidth / 2;
        const centerY = minY + contentHeight / 2;

        // Actualizar el zoom
        this.currentScale = newZoom;
        this.zoomSlider.value = newZoom;
        this.zoomLabel.textContent = `${Math.round(newZoom * 100)}%`;

        // Calcular nueva traducción para centrar el contenido
        this.translationX = (containerWidth / 2) - centerX * newZoom;
        this.translationY = (containerHeight / 2) - centerY * newZoom;
      }
    }

    /**
     * Asegura que el organigrama permanece visible en el contenedor
     */
    ensureChartIsVisible() {
      const containerRect = this.container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;

      // Calcular el área visible del organigrama considerando zoom y translación
      const visibleWidth = containerWidth / this.currentScale;
      const visibleHeight = containerHeight / this.currentScale;

      // Coordenadas del extremo izquierdo y superior del área visible
      const visibleLeft = -this.translationX / this.currentScale;
      const visibleTop = -this.translationY / this.currentScale;

      // Coordenadas extremas del organigrama
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;

      // Encontrar los límites del organigrama usando las posiciones de los nodos
      Object.values(this.nodePositions).forEach(pos => {
        minX = Math.min(minX, pos.x - this.options.nodeWidth/2);
        maxX = Math.max(maxX, pos.x + this.options.nodeWidth/2);

        const levelY = pos.level * (this.options.nodeHeight + this.options.verticalSpacing) + 50;
        minY = Math.min(minY, levelY - this.options.nodeHeight/2);
        maxY = Math.max(maxY, levelY + this.options.nodeHeight/2 + 60); // +60 para incluir el texto
      });

      // Si no hay nodos, usar valores predeterminados
      if (minX === Infinity) {
        minX = 0;
        maxX = this.svgWidth;
        minY = 0;
        maxY = this.svgHeight;
      }

      // Verificar si alguna parte del organigrama está fuera del área visible

      // Ajustar horizontalmente si es necesario
      if (visibleLeft > minX) {
        // Si el borde izquierdo está fuera de vista, ajustamos
        this.translationX = -minX * this.currentScale;
      } else if (visibleLeft + visibleWidth < maxX) {
        // Si el borde derecho está fuera de vista y hay nodos a la izquierda
        if (minX < visibleLeft) {
          // Centramos el organigrama horizontalmente
          this.translationX = -(minX + (maxX - minX)/2 - visibleWidth/2) * this.currentScale;
        }
      }

      // Ajustar verticalmente si es necesario
      if (visibleTop > minY) {
        // Si el borde superior está fuera de vista, ajustamos
        this.translationY = -minY * this.currentScale;
      }
    }

    /**
     * Maps the current connections between nodes
     * @returns {Map} Map of parent-child connections
     */
    mapCurrentConnections() {
      const connections = new Map();

      // Recursive function to map all visible connections
      const traverse = (node, parent = null) => {
        if (parent) {
          if (!connections.has(parent.id)) {
            connections.set(parent.id, []);
          }
          connections.get(parent.id).push(node.id);
        }

        // Only traverse children if the node is expanded
        if (node.children && node.children.length > 0 && this.expandedNodes.get(node.id)) {
          node.children.forEach(child => traverse(child, node));
        }
      };

      // Start from root nodes
      this.hierarchicalData.forEach(node => traverse(node));

      return connections;
    }

    /**
     * Renders the entire organizational chart
     */
    render() {
      // Clear the container
      this.container.innerHTML = '';

      // Create container for zoom controls
      this.createZoomControls();

      // Create the SVG element with all necessary namespaces
      this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      this.svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      this.svg.setAttribute('width', this.options.width || '100%');
      this.svg.setAttribute('height', this.options.height || '100%');
      this.svg.setAttribute('viewBox', `0 0 ${this.svgWidth} ${this.svgHeight}`);
      this.svg.setAttribute('class', 'organigrama');

      // Main group that will contain the entire chart and allow dragging
      this.draggableGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      this.svg.appendChild(this.draggableGroup);

      // Add the SVG to the container
      this.container.appendChild(this.svg);

      // Configure drag events
      this.configureDrag();

      // IMPORTANTE: Initialize transformation values BEFORE rendering and centering
      this.currentScale = 1;
      this.translationX = 0;
      this.translationY = 0;

      // Render the chart based on calculated positions
      this.renderChart();

      // Center the chart (ahora las transformaciones ya están inicializadas)
      this.centerChart();

      // Update transformation to reflect changes
      this.updateTransformation();
    }

    /**
     * Centers the chart in the container
     */
    centerChart() {
      // Obtener dimensiones del contenedor
      const containerRect = this.container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;

      // Si hay un solo nodo raíz, centrarlo
      if (this.hierarchicalData.length === 1) {
        const rootNodeId = this.hierarchicalData[0].id;
        const rootNodeInfo = this.nodePositions[rootNodeId];

        if (rootNodeInfo) {
          // Calcular la traducción para centrar el nodo raíz horizontalmente
          this.translationX = (containerWidth / 2) - rootNodeInfo.x;
          // Posicionar un poco más arriba - solo un 10% desde la parte superior
          this.translationY = 50;
        } else {
          this.centerOnSVG(containerWidth, containerHeight);
        }
      } else {
        this.centerOnSVG(containerWidth, containerHeight);
      }

      // Asegurar que la traducción en Y nunca sea negativa
      if (this.translationY < 0) {
        this.translationY = 20; // Margen superior mínimo
      }
    }

    /**
     * Centers the view on the entire SVG
     * @param {number} containerWidth - Container width
     * @param {number} containerHeight - Container height
     */
    centerOnSVG(containerWidth = null, containerHeight = null) {
      // Si no se proporcionan dimensiones, obtenerlas
      if (containerWidth === null || containerHeight === null) {
        const containerRect = this.container.getBoundingClientRect();
        containerWidth = containerRect.width;
        containerHeight = containerRect.height;
      }

      // Calcular la traducción para centrar horizontalmente
      this.translationX = (containerWidth - this.svgWidth) / 2;
      // Posición vertical fija y cercana a la parte superior
      this.translationY = 50;

      // Asegurar que la traducción en Y nunca sea negativa
      if (this.translationY < 0) {
        this.translationY = 20; // Margen superior mínimo
      }
    }

    /**
     * Updates the transformation applied to the main group to reflect zoom and position
     */
    updateTransformation() {
      // Aplicar la transformación al grupo arrastrable
      this.draggableGroup.setAttribute('transform', `translate(${this.translationX},${this.translationY})`);

      // Ajustar el tamaño del SVG para acomodar el nivel de zoom
      this.updateSVGViewBox();
    }

    /**
     * Centra el organigrama en el contenedor con un retraso para asegurar
     * que todos los elementos estén correctamente renderizados
     */
    centerOrgChart() {
      // Usar setTimeout para asegurar que todos los elementos estén renderizados
      setTimeout(() => {
        // Si hay un nodo raíz, enfócalo específicamente
        if (this.hierarchicalData && this.hierarchicalData.length > 0) {
          const rootNodeId = this.hierarchicalData[0].id;

          // Ajustar el viewBox para asegurar que el nodo raíz esté visible
          if (this.nodePositions && this.nodePositions[rootNodeId]) {
            const rootPos = this.nodePositions[rootNodeId];

            // Obtener dimensiones del contenedor
            const containerRect = this.container.getBoundingClientRect();
            const containerWidth = containerRect.width;

            // Centrar el nodo raíz horizontalmente
            this.translationX = (containerWidth / 2) - rootPos.x;

            // Posición vertical fija para asegurar que el nodo raíz esté visible
            this.translationY = 50;

            // Actualizar el viewBox SVG y aplicar transformaciones
            this.updateTransformation();
          }
        } else {
          // Si no hay nodo raíz, centrar todo el SVG
          this.centerChart();
          this.updateTransformation();
        }
      }, 100);
    }

    /**
     * Resets the view to center the chart and set zoom to 1
     */
    resetView() {
      // Reset zoom to 1
      this.currentScale = 1;
      this.zoomSlider.value = 1;
      this.zoomLabel.textContent = '100%';

      // Center the chart

      this.centerChart();

      // Update transformation
      this.updateTransformation();
    }

    /**
     * Ajusta el viewBox del SVG para simular zoom sin escalar los elementos
     */
    updateSVGViewBox() {
      // Obtener el tamaño actual del contenedor
      const containerRect = this.container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;

      // Calcular el nuevo viewBox basado en el zoom
      const viewBoxWidth = containerWidth / this.currentScale;
      const viewBoxHeight = containerHeight / this.currentScale;

      // Calcular el centro del viewBox actual
      const centerX = (-this.translationX / this.currentScale) + (viewBoxWidth / 2);
      const centerY = (-this.translationY / this.currentScale) + (viewBoxHeight / 2);

      // Calcular las coordenadas del nuevo viewBox
      // const viewBoxX = centerX - (viewBoxWidth / 2);
      const viewBoxX = 0; // adjusted to always start from 0
      const viewBoxY = centerY - (viewBoxHeight / 2);

      // Actualizar el viewBox del SVG
      this.svg.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`);
    }

    /**
     * Adjusts the zoom level
     * @param {number} delta - Change in zoom level
     */
    adjustZoom(delta) {
      const newZoom = Math.max(0.5, Math.min(3, this.currentScale + delta));
      this.setZoom(newZoom);
    }

    /**
     * Sets a specific zoom level
     * @param {number} newZoom - New zoom level
     */
    setZoom(newZoom) {
      // Guardar el centro actual del viewBox antes de cambiar el zoom
      const containerRect = this.container.getBoundingClientRect();
      const oldViewBoxWidth = containerRect.width / this.currentScale;
      const oldViewBoxHeight = containerRect.height / this.currentScale;
      const centerX = (-this.translationX / this.currentScale) + (oldViewBoxWidth / 2);
      const centerY = (-this.translationY / this.currentScale) + (oldViewBoxHeight / 2);

      // Actualizar el nivel de zoom
      this.currentScale = newZoom;
      this.zoomSlider.value = newZoom;
      this.zoomLabel.textContent = `${Math.round(newZoom * 100)}%`;

      // Calcular las nuevas dimensiones del viewBox
      const newViewBoxWidth = containerRect.width / newZoom;
      const newViewBoxHeight = containerRect.height / newZoom;

      // Ajustar la traducción para mantener el centro del viewBox
      this.translationX = -(centerX - (newViewBoxWidth / 2)) * newZoom;
      this.translationY = -(centerY - (newViewBoxHeight / 2)) * newZoom;

      // Aplicar la transformación actualizada
      this.updateTransformation();
    }

    /**
     * Renders the entire chart using previously calculated positions
     */
    renderChart() {
      const heightPerLevel = this.options.nodeHeight + this.options.verticalSpacing;

      // Ensure the SVG has the correct size before rendering
      this.adjustSVGSize();

      // First render the connections
      this.renderConnections();

      // Then render all nodes
      for (let levelIdx = 0; levelIdx < this.nodesAtLevel.length; levelIdx++) {
        const nodes = this.nodesAtLevel[levelIdx] || [];
        const posY = levelIdx * heightPerLevel + 50; // Base Y position for this level

        nodes.forEach(node => {
          const posX = this.nodePositions[node.id].x;
          this.renderNode(node, posX, posY, levelIdx);
        });
      }
    }

    /**
     * Renders the connections between nodes
     */
    renderConnections() {
      const heightPerLevel = this.options.nodeHeight + this.options.verticalSpacing;
      const parentMap = new Map();

      // More robust function to build the parent map
      const buildParentMap = (nodes, parent = null) => {
        for (const node of nodes) {
          if (parent) {
            parentMap.set(node.id, parent);
          }

          // Always process children to build the complete map
          // regardless of whether the node is expanded or not
          if (node.children && node.children.length > 0) {
            // Corregido: usar node como parent en la llamada recursiva, no parent
            buildParentMap(node.children, node);
          }
        }
      };

      // Build the complete parent map
      buildParentMap(this.hierarchicalData);

      // Use a different approach to determine which nodes should have visible connections
      // Group nodes by parent
      const groupedNodes = {};

      // Traverse all nodes that are at visible levels
      for (let levelIdx = 0; levelIdx < this.nodesAtLevel.length; levelIdx++) {
        const nodes = this.nodesAtLevel[levelIdx] || [];

        for (const node of nodes) {
          // Get the parent of this node
          const parent = parentMap.get(node.id);

          if (parent) {
            // Check if the parent is expanded
            const parentExpanded = this.expandedNodes.get(parent.id);

            if (parentExpanded) {
              // Add this node to the parent's child list
              if (!groupedNodes[parent.id]) {
                groupedNodes[parent.id] = [];
              }
              groupedNodes[parent.id].push(node);
            }
          }
        }
      }

      // For each parent with visible children, draw the connections
      Object.keys(groupedNodes).forEach(parentId => {
        const children = groupedNodes[parentId];
        if (!children || !children.length) return;

        // Find parent information
        const parentInfo = this.nodePositions[parentId];
        if (!parentInfo) return;

        const parentX = parentInfo.x;
        const parentLevel = parentInfo.level;
        const parentY = parentLevel * heightPerLevel + 50;

        // Find the complete parent node for additional information
        let parentNode = this.findNodeById(Number(parentId));
        if (!parentNode) return; // If we can't find the node, exit

        // Get the position of the parent's title
        let parentTitleY = parentY + this.options.avatarSize / 2;

        // Add additional height for the parent's name
        parentTitleY += this.getNameSize(parentNode);

        // Get position information of visible children
        const childrenInfo = children.map(child => {
          const childInfo = this.nodePositions[child.id];
          if (!childInfo) return null;

          return {
            node: child,
            x: childInfo.x,
            y: childInfo.level * heightPerLevel + 50
          };
        }).filter(info => info !== null);

        if (!childrenInfo.length) return;

        // Sort children by X position to draw lines correctly
        childrenInfo.sort((a, b) => a.x - b.x);

        // Calculate the midpoint between the parent's title and the first child's avatar
        const minChildY = Math.min(...childrenInfo.map(info => info.y));
        const midpointY = parentTitleY + Math.min(
          (minChildY - parentTitleY) / 3,
          heightPerLevel / 2
        );

        // 1. Vertical line from parent to midpoint
        const parentVerticalLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        parentVerticalLine.setAttribute('class', 'linea-conexion');
        parentVerticalLine.setAttribute('x1', parentX);
        parentVerticalLine.setAttribute('y1', parentTitleY + 2);
        parentVerticalLine.setAttribute('x2', parentX);
        parentVerticalLine.setAttribute('y2', midpointY);
        this.draggableGroup.appendChild(parentVerticalLine);

        // If there is more than one child, draw a horizontal line between the first and last
        if (childrenInfo.length > 1) {
          const firstChildX = childrenInfo[0].x;
          const lastChildX = childrenInfo[childrenInfo.length - 1].x;

          const horizontalLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          horizontalLine.setAttribute('class', 'linea-conexion');
          horizontalLine.setAttribute('x1', firstChildX);
          horizontalLine.setAttribute('y1', midpointY);
          horizontalLine.setAttribute('x2', lastChildX);
          horizontalLine.setAttribute('y2', midpointY);
          this.draggableGroup.appendChild(horizontalLine);
        }

        // For each visible child, draw a vertical line from the midpoint to the child
        childrenInfo.forEach(childInfo => {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('class', 'linea-conexion');
          path.setAttribute('d', `M ${childInfo.x} ${midpointY} V ${childInfo.y - this.options.avatarSize / 2}`);
          this.draggableGroup.appendChild(path);
        });
      });
    }

    /**
     * Gets the vertical size needed for the name based on its length
     * @param {Object} node - The node to calculate the name size for
     * @returns {number} - Additional height for the name
     */
    getNameSize(node) {
      const name = node.name || '';
      const nameParts = name.split(' ');

      // If the name has more than 2 words, it needs more space
      return (nameParts.length <= 2) ? 40 : 60;
    }

    /**
     * Renders an individual node
     * @param {Object} node - Node to render
     * @param {number} x - X position of the node
     * @param {number} y - Y position of the node
     * @param {number} level - Node's level in the hierarchy
     */
    renderNode(node, x, y, level) {
      // Create the group for the node
      const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      nodeGroup.setAttribute('class', 'nodo-organigrama');
      nodeGroup.setAttribute('data-id', node.id);

      // Mark if it has children to apply CSS styles
      const hasChildren = node.children && node.children.length > 0;
      nodeGroup.setAttribute('data-tiene-hijos', hasChildren ? 'true' : 'false');

      // If it has children, make the node clickable to expand/collapse
      if (hasChildren) {
        nodeGroup.addEventListener('click', () => this.toggleNode(node.id));
      }

      // Draw the avatar (circle)
      const avatarCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      avatarCircle.setAttribute('class', 'avatar');
      avatarCircle.setAttribute('cx', x);
      avatarCircle.setAttribute('cy', y);
      avatarCircle.setAttribute('r', this.options.avatarSize / 2);
      nodeGroup.appendChild(avatarCircle);

      // Add avatar image if it exists
      if (node.img) {
        // Instead of using patterns that can have issues, use direct image with clip path
        const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        image.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', node.img);
        image.setAttribute('x', x - this.options.avatarSize / 2);
        image.setAttribute('y', y - this.options.avatarSize / 2);
        image.setAttribute('width', this.options.avatarSize);
        image.setAttribute('height', this.options.avatarSize);

        // Create a clipPath to make the image circular
        const clipPathId = `clip-path-${node.id}`;
        const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
        clipPath.setAttribute('id', clipPathId);
        const clipCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        clipCircle.setAttribute('cx', x);
        clipCircle.setAttribute('cy', y);
        clipCircle.setAttribute('r', this.options.avatarSize / 2);
        clipPath.appendChild(clipCircle);

        this.svg.appendChild(clipPath);

        // Apply the clip path to the image
        image.setAttribute('clip-path', `url(#${clipPathId})`);

        // Add the image to the node group
        nodeGroup.appendChild(image);

        // The avatar circle will be transparent to show the image
        avatarCircle.setAttribute('fill', 'transparent');
      }

      // Add border to the circle
      const avatarBorder = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      avatarBorder.setAttribute('class', 'borde-avatar');
      avatarBorder.setAttribute('cx', x);
      avatarBorder.setAttribute('cy', y);
      avatarBorder.setAttribute('r', this.options.avatarSize / 2);
      nodeGroup.appendChild(avatarBorder);

      // Add name
      const nameText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      nameText.setAttribute('class', 'nombre');
      nameText.setAttribute('x', x);
      nameText.setAttribute('y', y + this.options.avatarSize / 2 + 20);

      // Split the name into lines if necessary
      const name = node.name || '';
      const nameParts = name.split(' ');

      if (nameParts.length <= 2) {
        // One or two words, show on one line
        nameText.textContent = name;
      } else {
        // More than two words, split into two lines
        const midpoint = Math.ceil(nameParts.length / 2);
        const firstPart = nameParts.slice(0, midpoint).join(' ');
        const secondPart = nameParts.slice(midpoint).join(' ');

        const firstLine = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        firstLine.setAttribute('x', x);
        firstLine.setAttribute('dy', '0');
        firstLine.textContent = firstPart;
        nameText.appendChild(firstLine);

        const secondLine = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        secondLine.setAttribute('x', x);
        secondLine.setAttribute('dy', '1.2em');
        secondLine.textContent = secondPart;
        nameText.appendChild(secondLine);
      }

      nodeGroup.appendChild(nameText);

      // Add title
      const titleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      titleText.setAttribute('class', 'cargo');
      titleText.setAttribute('x', x);

      // Adjust vertical position based on the number of name lines
      const titleY = y + this.options.avatarSize / 2 + (nameParts.length <= 2 ? 40 : 60);
      titleText.setAttribute('y', titleY);

      // Convert first letter to uppercase
      const title = node.title || '';
      titleText.textContent = title.charAt(0).toUpperCase() + title.slice(1);

      nodeGroup.appendChild(titleText);

      // Add the node to the SVG
      this.draggableGroup.appendChild(nodeGroup);

      // If it has children, add the expand/collapse button
      if (hasChildren) {
        // Add visual indicator for expand/collapse (+ or -) at the center right of the avatar
        const buttonX = x + this.options.avatarSize/2 + 5; // Just to the right of the avatar
        const buttonY = y; // Same vertical level as the center of the avatar
        this.addExpandCollapseButton(node, buttonX, buttonY);
      }
    }

    /**
     * Adds a button to expand/collapse a node
     * @param {Object} node - Node to add the button to
     * @param {number} x - X position of the button
     * @param {number} y - Y position of the button
     */
    addExpandCollapseButton(node, x, y) {
      // Determine if the node is expanded
      const isExpanded = this.expandedNodes.get(node.id);

      // Create group for the button
      const buttonGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      buttonGroup.setAttribute('class', 'boton-expandir-colapsar');
      buttonGroup.setAttribute('data-nodo-id', node.id);

      // Button circle with different colors for expand/collapse
      const buttonCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      buttonCircle.setAttribute('class', 'circulo-boton');
      buttonCircle.setAttribute('cx', x);
      buttonCircle.setAttribute('cy', y);
      buttonCircle.setAttribute('r', 8); // Slightly reduced size for better fit

      // Use the same color for expand and collapse (green)
      buttonCircle.style.stroke = this.options.nodeColor; // Use node color (green)
      buttonCircle.style.strokeWidth = '2'; // Thicker border for better visibility

      // Symbol inside the button (+ or -)
      const buttonSymbol = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      buttonSymbol.setAttribute('class', 'simbolo-boton');
      buttonSymbol.setAttribute('x', x);
      buttonSymbol.setAttribute('y', y + 1); // Adjustment to better center the symbol
      buttonSymbol.style.fontSize = '14px'; // Slightly larger font size
      buttonSymbol.textContent = isExpanded ? '-' : '+';

      // Use the same color for the symbol in both states
      buttonSymbol.style.fill = this.options.nodeColor; // Use node color (green)

      // Add elements to the group
      buttonGroup.appendChild(buttonCircle);
      buttonGroup.appendChild(buttonSymbol);

      // Add click event with propagation stop
      buttonGroup.addEventListener('click', (e) => {
        e.stopPropagation(); // Stop propagation to avoid triggering click on the node
        this.toggleNode(node.id);
      });

      // Add the button to the SVG
      this.draggableGroup.appendChild(buttonGroup);
    }

    /**
     * Expands all nodes in the chart
     */
    expandAll() {
      this.expandedNodes.forEach((value, key) => {
        this.expandedNodes.set(key, true);
      });

      // Recalculate dimensions and positions
      this.calculateDimensions();

      // Re-render
      this.render();

      // Auto-ajustar el zoom para mostrar todo el contenido visible
      this.autoAdjustZoom();

      // Actualizar la transformación
      this.updateTransformation();
    }

    /**
     * Collapses all nodes in the chart, except those configured as initially visible
     */
    collapseAll() {
      // Recursive function to collapse nodes by level
      const collapseByLevel = (nodes, level) => {
        nodes.forEach(node => {
          // If the level is greater than or equal to initialVisibleLevels, collapse
          this.expandedNodes.set(node.id, level < this.options.initialVisibleLevels);

          // Process children recursively
          if (node.children && node.children.length > 0) {
            collapseByLevel(node.children, level + 1);
          }
        });
      };

      // Start from root nodes (level 0)
      collapseByLevel(this.hierarchicalData, 0);

      // Recalculate dimensions and positions
      this.calculateDimensions();

      // Re-render
      this.render();

      // Auto-ajustar el zoom para mostrar todo el contenido visible
      this.autoAdjustZoom();

      // Actualizar la transformación
      this.updateTransformation();
    }

    /**
     * Finds a node by its ID in the hierarchical structure
     * @param {number|string} id - ID of the node to find
     * @returns {Object|null} - The found node or null if it doesn't exist
     */
    findNodeById(id) {
      // Recursive function to search the tree
      const searchNodes = (nodes) => {
        for (const node of nodes) {
          if (node.id == id) {
            return node;
          }
          if (node.children && node.children.length > 0) {
            const found = searchNodes(node.children);
            if (found) return found;
          }
        }
        return null;
      };

      return searchNodes(this.hierarchicalData);
    }

    /**
     * Resets the view to the initially configured levels
     */
    resetLevels() {
      this.configureInitialExpansion();
      this.calculateDimensions();
      this.render();
    }

    /**
     * Updates the chart with new data
     * @param {Object} newData - New data for the chart
     * @param {Object} [options] - Optional new options to apply
     */
    update(newData, options = null) {
      // If new options are provided, update them
      if (options) {
        this.options = { ...this.options, ...options };
      }

      this.data = newData;
      this.hierarchicalData = null;
      this.expandedNodes = new Map();
      this.initialize();

      // Auto-ajustar el zoom al cargar nuevos datos
      this.autoAdjustZoom();

      // Actualizar la transformación
      this.updateTransformation();
    }

    /**
     * Adjusts the size of the chart to the container
     */
    resize() {
      this.calculateDimensions();
      this.render();
    }

    /**
     * Assigns X positions to each node
     * @param {Array} treeNodes - Nodes to position
     * @param {number} startX - Initial X position
     * @param {number} currentLevel - Current hierarchical level
     */
    assignXPositions(treeNodes, startX, currentLevel) {
      // Ensure there is an array for this level
      if (!this.nodesAtLevel[currentLevel]) {
        this.nodesAtLevel[currentLevel] = [];
      }

      // Calculate the total width needed
      const calculateTotalWidth = (nodes) => {
        if (nodes.length === 0) return 0;

        let totalWidth = 0;
        for (const node of nodes) {
          // Each node occupies its width plus spacing
          totalWidth += this.options.nodeWidth + this.options.horizontalSpacing;
        }
        // Remove the last spacing that is extra
        return totalWidth - this.options.horizontalSpacing;
      };

      // First pass: position all children
      for (let i = 0; i < treeNodes.length; i++) {
        const nodeInfo = treeNodes[i];
        this.nodesAtLevel[currentLevel].push(nodeInfo.node);

        // If the node has children, position them first
        if (nodeInfo.children && nodeInfo.children.length > 0) {
          // Calculate the width needed for the children
          const childrenWidth = calculateTotalWidth(nodeInfo.children);

          // Calculate the initial X position for the children
          let childrenStartX = startX;

          // If there is more space in the parent node, center the children
          if (this.options.nodeWidth > childrenWidth) {
            childrenStartX += (this.options.nodeWidth - childrenWidth) / 2;
          }

          // Position the children recursively
          this.assignXPositions(nodeInfo.children, childrenStartX, currentLevel + 1);

          // Advance the start position for the next node
          startX += nodeInfo.width + this.options.horizontalSpacing;
        } else {
          // If it has no children, simply position it
          this.nodePositions[nodeInfo.node.id] = {
            x: startX + nodeInfo.width / 2,
            level: currentLevel
          };

          // Advance the start position for the next node
          startX += nodeInfo.width + this.options.horizontalSpacing;
        }
      }

      // Second pass: adjust parents to be centered over their children
      for (let i = 0; i < treeNodes.length; i++) {
        const nodeInfo = treeNodes[i];

        if (nodeInfo.children && nodeInfo.children.length > 0) {
          // Find the X position of the leftmost and rightmost child
          const childrenIds = nodeInfo.children.map(h => h.node.id);
          const childrenXPositions = childrenIds.map(id => this.nodePositions[id]?.x || 0);
          if (childrenXPositions.length > 0) {
            const minX = Math.min(...childrenXPositions);
            const maxX = Math.max(...childrenXPositions);
            // Place the parent exactly in the center of its children
            this.nodePositions[nodeInfo.node.id] = {
              x: (minX + maxX) / 2,
              level: currentLevel
            };
          } else {
            // If there are no positioned children, use the default position
            this.nodePositions[nodeInfo.node.id] = {
              x: startX - this.options.horizontalSpacing - this.options.nodeWidth/2 + i * (this.options.nodeWidth + this.options.horizontalSpacing),
              level: currentLevel
            };
          }
        } else {
          // If it has no children, simply position it
          this.nodePositions[nodeInfo.node.id] = {
            x: startX - this.options.horizontalSpacing - this.options.nodeWidth/2 + i * (this.options.nodeWidth + this.options.horizontalSpacing),
            level: currentLevel
          };
        }
      }
    }

    /**
     * Adjusts the positions of an entire subtree when a node moves
     * @param {Object} parentNode - Parent node whose position changed
     * @param {number} adjustment - Amount of horizontal adjustment
     */
    adjustSubtreePositions(parentNode, adjustment) {
      if (!parentNode.children || parentNode.children.length === 0 || !this.expandedNodes.get(parentNode.id)) {
        return;
      }
      for (const child of parentNode.children) {
        if (this.nodePositions[child.id]) {
          this.nodePositions[child.id].x += adjustment;
          this.adjustSubtreePositions(child, adjustment);
        }
      }
    }

    /**
     * Creates zoom controls
     */
    createZoomControls() {
      const controlsContainer = document.createElement('div');
      controlsContainer.className = 'controles-zoom';

      // Zoom out button
      const zoomOutButton = document.createElement('button');
      zoomOutButton.innerHTML = '−';
      zoomOutButton.title = 'Reduce';
      zoomOutButton.className = 'btn-zoom-out';
      zoomOutButton.addEventListener('click', () => this.adjustZoom(-0.1));

      // Zoom slider - Modificado para permitir hasta 300% de zoom
      const zoomSlider = document.createElement('input');
      zoomSlider.type = 'range';
      zoomSlider.min = '0.5';
      zoomSlider.max = '3'; // Cambiado de 2 a 3 para 300%
      zoomSlider.step = '0.1';
      zoomSlider.value = '1';
      zoomSlider.addEventListener('input', (e) => this.setZoom(parseFloat(e.target.value)));

      // Label with zoom value
      const zoomValue = document.createElement('span');
      zoomValue.className = 'zoom-valor';
      zoomValue.textContent = '100%';
      this.zoomLabel = zoomValue;

      // Zoom in button
      const zoomInButton = document.createElement('button');
      zoomInButton.innerHTML = '+';
      zoomInButton.title = 'Enlarge';
      zoomInButton.className = 'btn-zoom-in';
      zoomInButton.addEventListener('click', () => this.adjustZoom(0.1));

      // Reset zoom button
      const resetButton = document.createElement('button');
      resetButton.innerHTML = '↺';
      resetButton.title = 'Reset view';
      resetButton.className = 'btn-zoom-reset';
      resetButton.addEventListener('click', () => this.resetView());

      // Add elements to the container
      controlsContainer.appendChild(zoomOutButton);
      controlsContainer.appendChild(zoomSlider);
      controlsContainer.appendChild(zoomValue);
      controlsContainer.appendChild(zoomInButton);
      controlsContainer.appendChild(resetButton);

      // Store references for later use
      this.zoomSlider = zoomSlider;

      // Ensure the container has relative position for correct positioning
      if (getComputedStyle(this.container).position === 'static') {
        this.container.style.position = 'relative';
      }

      // Add the container to the DOM
      this.container.appendChild(controlsContainer);

      // Crear los controles de ordenamiento
      if (this.options.showSortControls) {
        this.createSortControls();
      }
    }

    /**
     * Creates sort controls to allow changing the ordering of the chart
     */
    createSortControls() {
      const sortControlsContainer = document.createElement('div');
      sortControlsContainer.className = 'controles-orden';

      // Label for the sort selector
      const sortLabel = document.createElement('label');
      sortLabel.textContent = 'Ordenar por: ';
      sortLabel.className = 'etiqueta-orden';

      // Create sort dropdown
      const sortSelect = document.createElement('select');
      sortSelect.className = 'selector-orden';

      // Add sort options
      const sortOptions = [
        { value: 'name', text: 'Nombre' },
        { value: 'title', text: 'Cargo' },
        { value: 'id', text: 'ID' }
      ];

      sortOptions.forEach(option => {
        const optElement = document.createElement('option');
        optElement.value = option.value;
        optElement.textContent = option.text;
        // Select the current sort option
        if (option.value === this.options.sortBy) {
          optElement.selected = true;
        }
        sortSelect.appendChild(optElement);
      });

      // Direction button
      const directionBtn = document.createElement('button');
      directionBtn.className = 'btn-direccion';
      directionBtn.innerHTML = this.options.sortDirection === 'asc' ? '↑' : '↓';
      directionBtn.title = this.options.sortDirection === 'asc' ? 'Ascendente' : 'Descendente';

      // Apply button
      const applyBtn = document.createElement('button');
      applyBtn.className = 'btn-aplicar';
      applyBtn.textContent = 'Aplicar';

      // Add event listeners
      directionBtn.addEventListener('click', () => {
        const newDirection = directionBtn.innerHTML === '↑' ? 'desc' : 'asc';
        directionBtn.innerHTML = newDirection === 'asc' ? '↑' : '↓';
        directionBtn.title = newDirection === 'asc' ? 'Ascendente' : 'Descendente';
      });

      applyBtn.addEventListener('click', () => {
        const sortBy = sortSelect.value;
        const sortDirection = directionBtn.innerHTML === '↑' ? 'asc' : 'desc';
        this.changeSortOrder(sortBy, sortDirection);
      });

      // Add elements to the container
      sortControlsContainer.appendChild(sortLabel);
      sortControlsContainer.appendChild(sortSelect);
      sortControlsContainer.appendChild(directionBtn);
      sortControlsContainer.appendChild(applyBtn);

      // Add the sort controls to the DOM
      this.container.appendChild(sortControlsContainer);
    }

    /**
     * Configures events to allow dragging the chart
     */
    configureDrag() {
      let isDragging = false;
      let startX = 0;
      let startY = 0;

      // Mouse events
      this.svg.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // Solo botón principal del ratón
          isDragging = true;
          startX = e.clientX - this.translationX;
          startY = e.clientY - this.translationY;
          this.svg.classList.add('arrastrando');
        }
      });

      window.addEventListener('mousemove', (e) => {
        if (isDragging) {
          e.preventDefault();
          this.translationX = e.clientX - startX;
          this.translationY = e.clientY - startY;
          this.updateTransformation();
        }
      });

      window.addEventListener('mouseup', () => {
        isDragging = false;
        this.svg.classList.remove('arrastrando');
      });

      // Eventos táctiles para dispositivos móviles
      this.svg.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          e.preventDefault();
          isDragging = true;
          startX = e.touches[0].clientX - this.translationX;
          startY = e.touches[0].clientY - this.translationY;
          this.svg.classList.add('arrastrando');
        }
      });

      window.addEventListener('touchmove', (e) => {
        if (isDragging && e.touches.length === 1) {
          e.preventDefault();
          this.translationX = e.touches[0].clientX - startX;
          this.translationY = e.touches[0].clientY - startY;
          this.updateTransformation();
        }
      });

      window.addEventListener('touchend', () => {
        isDragging = false;
        this.svg.classList.remove('arrastrando');
      });

      // Evento de rueda del ratón para zoom
      this.svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        this.adjustZoom(delta);
      });
    }

    /**
     * Sorts the nodes in the tree according to configured options
     * @param {Array} nodes - The nodes to sort (sorted in place)
     * @param {number} level - Current level in the tree (for level-specific sorting)
     */
    sortNodes(nodes, level = 0) {
        if (!nodes || !nodes.length || !this.options.sortBy) {
            return; // No sorting needed
        }

        // If there's a custom sort function, use it
        if (this.options.sortBy === 'custom' && typeof this.options.sortFunction === 'function') {
            nodes.sort((a, b) => this.options.sortFunction(a, b, level));
        } else {
            // Standard sorting based on property
            const sortField = this.options.sortBy;
            const isAscending = this.options.sortDirection !== 'desc';

            nodes.sort((a, b) => {
                let valA = a[sortField];
                let valB = b[sortField];

                // Handle undefined or null values
                if (valA === undefined || valA === null) valA = '';
                if (valB === undefined || valB === null) valB = '';

                // Handle string comparisons case-insensitively
                if (typeof valA === 'string' && typeof valB === 'string') {
                    valA = valA.toLowerCase();
                    valB = valB.toLowerCase();
                }

                if (valA < valB) return isAscending ? -1 : 1;
                if (valA > valB) return isAscending ? 1 : -1;

                // Si tienen el mismo valor en el campo principal, usar el ID como desempate
                return isAscending ? (a.id - b.id) : (b.id - a.id);
            });
        }

        // After sorting this level, sort each node's children recursively
        for (const node of nodes) {
            if (node.children && node.children.length) {
                this.sortNodes(node.children, level + 1);
            }
        }
    }

    /**
     * Changes the sort options and re-renders the chart
     * @param {string} sortBy - Field to sort by ('name', 'title', 'id', 'custom')
     * @param {string} sortDirection - Sort direction ('asc' or 'desc')
     * @param {Function} [sortFunction] - Custom sort function when sortBy is 'custom'
     */
    changeSortOrder(sortBy, sortDirection = 'asc', sortFunction = null) {
        this.options.sortBy = sortBy;
        this.options.sortDirection = sortDirection;

        if (sortBy === 'custom' && typeof sortFunction === 'function') {
            this.options.sortFunction = sortFunction;
        }

        // Store the current expanded state of nodes
        const expandedStates = new Map(this.expandedNodes);

        // Reprocess data with new sort order
        // En lugar de establecer hierarchicalData a null, aplicamos el ordenamiento
        // directamente a la estructura existente para preservar otras propiedades
        if (this.hierarchicalData) {
            const sortAllLevels = (nodes, level) => {
                this.sortNodes(nodes, level);
                for (const node of nodes) {
                    if (node.children && node.children.length > 0) {
                        sortAllLevels(node.children, level + 1);
                    }
                }
            };

            sortAllLevels(this.hierarchicalData, 0);
        } else {
            this.processData();
        }

        // Restore expanded states
        this.expandedNodes = expandedStates;

        // Recalculate dimensions and re-render
        this.calculateDimensions();
        this.render();

        // Auto-ajustar el zoom al reordenar
        this.autoAdjustZoom();

        // Actualizar la transformación
        this.updateTransformation();
    }

    /**
     * Expone el método changeSortOrder para su uso externo
     * @param {string} sortBy - Campo por el cual ordenar los nodos
     * @param {string} sortDirection - Dirección del ordenamiento ('asc' o 'desc')
     * @param {Function} [sortFunction] - Función personalizada para ordenamiento cuando sortBy es 'custom'
     * @public
     */
    setSortOrder(sortBy, sortDirection = 'asc', sortFunction = null) {
      this.changeSortOrder(sortBy, sortDirection, sortFunction);
    }
  }

  // Export the class
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SimpleOrgChart;
  } else {
    window.SimpleOrgChart = SimpleOrgChart;
  }
