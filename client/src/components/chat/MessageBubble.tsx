import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageBubbleProps {
  message: string;
  sender: 'user' | 'assistant';
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, sender }) => {
  const isUser = sender === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} my-2`}>
      <div className={`p-3 my-2 rounded-xl text-md font-medium max-w-[80%] whitespace-pre-wrap ${
        isUser ? 'bg-orange-100 text-black self-end' : 'bg-neutral-100 text-black self-start'
      }`}>
        {isUser ? (
          message
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
