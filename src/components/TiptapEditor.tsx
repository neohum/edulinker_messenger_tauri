import { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';

// 글자 크기 확장 (커스텀)
import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

const FontSize = Extension.create({
  name: 'fontSize',

  addOptions() {
    return {
      types: ['textStyle'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize?.replace(/['"]+/g, ''),
            renderHTML: attributes => {
              if (!attributes.fontSize) {
                return {};
              }
              return {
                style: `font-size: ${attributes.fontSize}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) => {
          return chain().setMark('textStyle', { fontSize }).run();
        },
      unsetFontSize:
        () =>
        ({ chain }) => {
          return chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run();
        },
    };
  },
});

interface TiptapEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
}

// 툴바 버튼 컴포넌트
function ToolbarButton({
  isActive,
  onClick,
  children,
  title,
}: {
  isActive?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        isActive
          ? 'theme-primary-bg text-white'
          : 'theme-text-secondary hover:bg-white/30'
      }`}
    >
      {children}
    </button>
  );
}

// 색상 팔레트
const COLORS = [
  { name: '검정', value: '#000000' },
  { name: '빨강', value: '#ef4444' },
  { name: '주황', value: '#f97316' },
  { name: '노랑', value: '#eab308' },
  { name: '초록', value: '#22c55e' },
  { name: '파랑', value: '#3b82f6' },
  { name: '보라', value: '#8b5cf6' },
  { name: '분홍', value: '#ec4899' },
  { name: '회색', value: '#6b7280' },
];

// 글자 크기 옵션
const FONT_SIZES = [
  { name: '작게', value: '12px' },
  { name: '보통', value: '14px' },
  { name: '약간 크게', value: '16px' },
  { name: '크게', value: '18px' },
  { name: '아주 크게', value: '24px' },
  { name: '매우 크게', value: '32px' },
];

export default function TiptapEditor({
  content,
  onChange,
  placeholder = '메시지를 입력하세요...',
  className = '',
}: TiptapEditorProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFontSizePicker, setShowFontSizePicker] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      TextStyle,
      Color,
      FontSize,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[120px] p-3 theme-text',
      },
    },
  });

  if (!editor) {
    return null;
  }

  // 현재 색상 가져오기
  const currentColor = editor.getAttributes('textStyle').color || '#000000';

  return (
    <div className={`theme-surface-translucent border border-current/20 rounded-lg overflow-hidden ${className}`}>
      {/* 툴바 */}
      <div className="flex items-center gap-1 p-2 border-b border-current/10 flex-wrap">
        {/* 글자 크기 */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowFontSizePicker(!showFontSizePicker);
              setShowColorPicker(false);
            }}
            title="글자 크기"
            className="p-1.5 rounded transition-colors theme-text-secondary hover:bg-white/30 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 4v3h5v12h3V7h5V4H9zm-6 8h3v7h3v-7h3V9H3v3z"/>
            </svg>
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </button>
          {showFontSizePicker && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[120px]">
              {FONT_SIZES.map((size) => (
                <button
                  key={size.value}
                  type="button"
                  onClick={() => {
                    editor.chain().focus().setFontSize(size.value).run();
                    setShowFontSizePicker(false);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-gray-100 text-gray-700"
                  style={{ fontSize: size.value }}
                >
                  {size.name}
                </button>
              ))}
              <div className="border-t border-gray-200 mt-1 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().unsetFontSize().run();
                    setShowFontSizePicker(false);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-gray-100 text-gray-500 text-sm"
                >
                  기본 크기로
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 글자 색상 */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowColorPicker(!showColorPicker);
              setShowFontSizePicker(false);
            }}
            title="글자 색상"
            className="p-1.5 rounded transition-colors theme-text-secondary hover:bg-white/30 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
            </svg>
            <div
              className="w-3 h-3 rounded-full border border-gray-300"
              style={{ backgroundColor: currentColor }}
            />
          </button>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 p-2 z-50">
              <div className="grid grid-cols-3 gap-1">
                {COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => {
                      editor.chain().focus().setColor(color.value).run();
                      setShowColorPicker(false);
                    }}
                    title={color.name}
                    className="w-7 h-7 rounded-full border-2 border-gray-200 hover:border-gray-400 transition-colors"
                    style={{ backgroundColor: color.value }}
                  />
                ))}
              </div>
              <div className="border-t border-gray-200 mt-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().unsetColor().run();
                    setShowColorPicker(false);
                  }}
                  className="w-full px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded"
                >
                  색상 초기화
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-current/20 mx-1" />

        {/* 굵게 */}
        <ToolbarButton
          isActive={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="굵게 (Ctrl+B)"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/>
          </svg>
        </ToolbarButton>

        {/* 기울임 */}
        <ToolbarButton
          isActive={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="기울임 (Ctrl+I)"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/>
          </svg>
        </ToolbarButton>

        {/* 취소선 */}
        <ToolbarButton
          isActive={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="취소선"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z"/>
          </svg>
        </ToolbarButton>

        <div className="w-px h-5 bg-current/20 mx-1" />

        {/* 글머리 기호 목록 */}
        <ToolbarButton
          isActive={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="글머리 기호"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/>
          </svg>
        </ToolbarButton>

        {/* 번호 목록 */}
        <ToolbarButton
          isActive={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="번호 목록"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/>
          </svg>
        </ToolbarButton>

        <div className="w-px h-5 bg-current/20 mx-1" />

        {/* 인용구 */}
        <ToolbarButton
          isActive={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="인용구"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/>
          </svg>
        </ToolbarButton>


        {/* 실행 취소 */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          title="실행 취소 (Ctrl+Z)"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/>
          </svg>
        </ToolbarButton>

        {/* 다시 실행 */}
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          title="다시 실행 (Ctrl+Y)"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/>
          </svg>
        </ToolbarButton>
      </div>

      {/* 에디터 영역 */}
      <EditorContent editor={editor} />

      {/* 드롭다운 외부 클릭 시 닫기 */}
      {(showColorPicker || showFontSizePicker) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowColorPicker(false);
            setShowFontSizePicker(false);
          }}
        />
      )}
    </div>
  );
}
