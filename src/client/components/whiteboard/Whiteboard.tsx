import React, { useRef, useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { Pen, Eraser, Square, Circle, Minus, Trash2, Download, Palette, Minimize2, Maximize2 } from 'lucide-react';

interface WhiteboardProps {
  roomId: string;
  onClose?: () => void;
}

export const Whiteboard: React.FC<WhiteboardProps> = ({ roomId, onClose }) => {
  const { socket } = useSocket();
  const { user } = useAuth();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);
  const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser' | 'rect' | 'circle' | 'line'>('pen');
  const [color, setColor] = useState('#10b981'); // Verde esmeralda padrão
  const [lineWidth, setLineWidth] = useState(3);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const startPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const snapshot = useRef<ImageData | null>(null);

  const colors = [
    '#ffffff', // Branco
    '#10b981', // Verde
    '#3b82f6', // Azul
    '#ef4444', // Vermelho
    '#f59e0b', // Amarelo
    '#a855f7', // Roxo
    '#06b6d4', // Ciano
  ];

  // Configurar Canvas inicial
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ajustar tamanho real do canvas
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    ctx.fillStyle = '#0f172a'; // Fundo do quadro (Slate escuro/lousa moderna)
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Listener para redimensionamento de janela
    const handleResize = () => {
      if (!canvas) return;
      const prevData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const newRect = canvas.getBoundingClientRect();
      canvas.width = newRect.width;
      canvas.height = newRect.height;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.putImageData(prevData, 0, 0);
    };

    window.addEventListener('resize', handleResize);

    // Pedir o histórico (o whiteboard-init do join pode ter chegado antes do
    // componente montar — aqui garantimos que o quadro abre com o histórico).
    socket?.emit('whiteboard-init-request', { roomId });

    // Receber histórico do quadro
    socket?.on('whiteboard-init', (history: any[]) => {
      history.forEach((stroke) => {
        applyRemoteStroke(ctx, stroke);
      });
    });

    // Receber traço em tempo real de outros usuários
    socket?.on('whiteboard-draw', (stroke: any) => {
      applyRemoteStroke(ctx, stroke);
    });

    // Receber evento de limpar quadro
    socket?.on('whiteboard-clear', () => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      socket?.off('whiteboard-init');
      socket?.off('whiteboard-draw');
      socket?.off('whiteboard-clear');
    };
  }, [socket]);

  const applyRemoteStroke = (ctx: CanvasRenderingContext2D, stroke: any) => {
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = stroke.tool === 'eraser' ? '#0f172a' : stroke.color;
    ctx.lineWidth = stroke.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.tool === 'highlighter') {
      ctx.globalAlpha = 0.3;
    } else {
      ctx.globalAlpha = 1.0;
    }

    if (stroke.tool === 'pen' || stroke.tool === 'highlighter' || stroke.tool === 'eraser') {
      if (stroke.points && stroke.points.length > 0) {
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      }
    } else if (stroke.tool === 'rect') {
      ctx.strokeRect(stroke.x, stroke.y, stroke.width, stroke.height);
    } else if (stroke.tool === 'circle') {
      const radius = Math.sqrt(Math.pow(stroke.width, 2) + Math.pow(stroke.height, 2));
      ctx.arc(stroke.x, stroke.y, radius, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (stroke.tool === 'line') {
      ctx.moveTo(stroke.x1, stroke.y1);
      ctx.lineTo(stroke.x2, stroke.y2);
      ctx.stroke();
    }

    ctx.restore();
  };

  // Coordenadas relativas do ponteiro (Mouse ou Touch)
  const getPointerPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const currentPoints = useRef<Array<{ x: number; y: number }>>([]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isDrawing.current = true;
    const pos = getPointerPos(e);
    startPos.current = pos;
    currentPoints.current = [pos];

    snapshot.current = ctx.getImageData(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getPointerPos(e);

    ctx.strokeStyle = tool === 'eraser' ? '#0f172a' : color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'highlighter') {
      ctx.globalAlpha = 0.3;
    } else {
      ctx.globalAlpha = 1.0;
    }

    if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      currentPoints.current.push(pos);
    } else {
      // Formas geométricas: restaurar o frame inicial antes de desenhar a forma
      if (snapshot.current) {
        ctx.putImageData(snapshot.current, 0, 0);
      }
      ctx.beginPath();
      if (tool === 'rect') {
        ctx.strokeRect(startPos.current.x, startPos.current.y, pos.x - startPos.current.x, pos.y - startPos.current.y);
      } else if (tool === 'circle') {
        const radius = Math.sqrt(Math.pow(pos.x - startPos.current.x, 2) + Math.pow(pos.y - startPos.current.y, 2));
        ctx.arc(startPos.current.x, startPos.current.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (tool === 'line') {
        ctx.moveTo(startPos.current.x, startPos.current.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      }
    }
  };

  const stopDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    const pos = getPointerPos(e);
    let strokeData: any = null;

    if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
      strokeData = {
        tool,
        color,
        lineWidth,
        points: currentPoints.current,
      };
    } else if (tool === 'rect') {
      strokeData = {
        tool,
        color,
        lineWidth,
        x: startPos.current.x,
        y: startPos.current.y,
        width: pos.x - startPos.current.x,
        height: pos.y - startPos.current.y,
      };
    } else if (tool === 'circle') {
      strokeData = {
        tool,
        color,
        lineWidth,
        x: startPos.current.x,
        y: startPos.current.y,
        width: pos.x - startPos.current.x,
        height: pos.y - startPos.current.y,
      };
    } else if (tool === 'line') {
      strokeData = {
        tool,
        color,
        lineWidth,
        x1: startPos.current.x,
        y1: startPos.current.y,
        x2: pos.x,
        y2: pos.y,
      };
    }

    if (strokeData && socket) {
      socket.emit('whiteboard-draw', { roomId, drawData: strokeData });
    }
    currentPoints.current = [];
  };

  const clearBoard = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    socket?.emit('whiteboard-clear', { roomId });
  };

  const downloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const image = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = image;
    link.download = `quadro-escola-online-${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
  };

  return (
    <div
      className={`flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl transition-all ${
        isFullScreen ? 'fixed inset-4 z-50' : 'w-full h-full min-h-[420px]'
      }`}
    >
      {/* Barra Superior de Ferramentas */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTool('pen')}
            className={`p-2 rounded-lg transition-colors ${tool === 'pen' ? 'bg-brand-500 text-slate-950' : 'text-slate-400 hover:bg-slate-800'}`}
            title="Caneta"
          >
            <Pen className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTool('eraser')}
            className={`p-2 rounded-lg transition-colors ${tool === 'eraser' ? 'bg-brand-500 text-slate-950' : 'text-slate-400 hover:bg-slate-800'}`}
            title="Borracha"
          >
            <Eraser className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTool('rect')}
            className={`p-2 rounded-lg transition-colors ${tool === 'rect' ? 'bg-brand-500 text-slate-950' : 'text-slate-400 hover:bg-slate-800'}`}
            title="Retângulo"
          >
            <Square className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTool('circle')}
            className={`p-2 rounded-lg transition-colors ${tool === 'circle' ? 'bg-brand-500 text-slate-950' : 'text-slate-400 hover:bg-slate-800'}`}
            title="Círculo"
          >
            <Circle className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTool('line')}
            className={`p-2 rounded-lg transition-colors ${tool === 'line' ? 'bg-brand-500 text-slate-950' : 'text-slate-400 hover:bg-slate-800'}`}
            title="Linha"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>

        {/* Cores */}
        <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-900 rounded-xl border border-slate-800">
          <Palette className="w-3.5 h-3.5 text-slate-500 mr-1 hidden sm:block" />
          {colors.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-5 h-5 rounded-full border transition-transform ${
                color === c ? 'scale-125 border-white shadow-md' : 'border-transparent hover:scale-110'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {/* Espessura & Ações */}
        <div className="flex items-center gap-2">
          <select
            value={lineWidth}
            onChange={(e) => setLineWidth(Number(e.target.value))}
            className="bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded-lg px-2 py-1 focus:outline-none"
          >
            <option value="2">Fina (2px)</option>
            <option value="4">Média (4px)</option>
            <option value="8">Grossa (8px)</option>
            <option value="16">Destaque (16px)</option>
          </select>

          <button
            onClick={clearBoard}
            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
            title="Limpar quadro"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            onClick={downloadImage}
            className="p-1.5 text-slate-400 hover:text-brand-400 hover:bg-slate-800 rounded-lg transition-colors"
            title="Baixar imagem do quadro"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title={isFullScreen ? 'Minimizar' : 'Tela cheia'}
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Área do Canvas */}
      <div className="flex-1 relative bg-slate-950 cursor-crosshair overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-full block"
        />
      </div>
    </div>
  );
};
