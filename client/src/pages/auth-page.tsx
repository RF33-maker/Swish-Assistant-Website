import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertUserSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Layers, User, LucideGithub, Mail } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { SiLinkedin } from "react-icons/si";

const loginSchema = z.object({
  username: z.string().min(1, { message: "Email is required" }).email({ message: "Invalid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
  rememberMe: z.boolean().optional(),
});

const registerSchema = insertUserSchema.extend({
  confirmPassword: z.string().min(1, { message: "Confirm password is required" }),
  terms: z.boolean().refine(val => val === true, { message: "You must accept the terms and conditions" }),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [_, setLocation] = useLocation();

  // Redirect if user is already logged in
  useEffect(() => {
    if (user) {
      setLocation("/");
    }
  }, [user, setLocation]);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
      rememberMe: false,
    },
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      password: "",
      confirmPassword: "",
      terms: false,
    },
  });

  const onLoginSubmit = (values: z.infer<typeof loginSchema>) => {
    loginMutation.mutate({
      username: values.username,
      password: values.password,
    });
  };

  const onRegisterSubmit = (values: z.infer<typeof registerSchema>) => {
    registerMutation.mutate({
      username: values.username,
      password: values.password,
    });
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left Column - Auth Forms */}
      <div className="w-full md:w-1/2 p-4 md:p-8 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <div className="h-12 w-12 bg-primary rounded-md flex items-center justify-center text-primary-foreground">
                <Layers size={28} />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Design Platform</CardTitle>
            <CardDescription>Sign in to your account or create a new one</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
              
              <TabsContent value="login">
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                    <FormField
                      control={loginForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input placeholder="your@email.com" {...field} type="email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input placeholder="••••••••" {...field} type="password" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex items-center justify-between">
                      <FormField
                        control={loginForm.control}
                        name="rememberMe"
                        render={({ field }) => (
                          <div className="flex items-center space-x-2">
                            <Checkbox 
                              id="rememberMe" 
                              checked={field.value} 
                              onCheckedChange={field.onChange}
                            />
                            <label
                              htmlFor="rememberMe"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              Remember me
                            </label>
                          </div>
                        )}
                      />
                      <a href="#" className="text-sm font-medium text-primary hover:text-primary/90">
                        Forgot password?
                      </a>
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={loginMutation.isPending}
                    >
                      {loginMutation.isPending ? "Signing in..." : "Sign in"}
                    </Button>
                  </form>
                </Form>
              </TabsContent>
              
              <TabsContent value="register">
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                    <FormField
                      control={registerForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input placeholder="your@email.com" {...field} type="email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input placeholder="••••••••" {...field} type="password" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm Password</FormLabel>
                          <FormControl>
                            <Input placeholder="••••••••" {...field} type="password" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="terms"
                      render={({ field }) => (
                        <div className="flex items-start space-x-2 mt-4">
                          <Checkbox 
                            id="terms" 
                            checked={field.value} 
                            onCheckedChange={field.onChange}
                            className="mt-1"
                          />
                          <div className="grid gap-1.5 leading-none">
                            <label
                              htmlFor="terms"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              I agree to the terms of service and privacy policy
                            </label>
                          </div>
                        </div>
                      )}
                    />
                    <Button 
                      type="submit" 
                      className="w-full mt-6" 
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending ? "Creating account..." : "Create account"}
                    </Button>
                  </form>
                </Form>
              </TabsContent>
            </Tabs>

            <div className="relative mt-6">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3">
              <Button variant="outline" size="icon" className="h-10">
                <FcGoogle className="h-5 w-5" />
              </Button>
              <Button variant="outline" size="icon" className="h-10">
                <LucideGithub className="h-5 w-5" />
              </Button>
              <Button variant="outline" size="icon" className="h-10">
                <SiLinkedin className="h-5 w-5 text-[#0A66C2]" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column - Hero */}
      <div className="hidden md:block md:w-1/2 bg-gradient-to-br from-primary/90 to-primary/60 p-8 text-white">
        <div className="h-full flex flex-col justify-center max-w-lg mx-auto">
          <h1 className="text-4xl font-bold mb-6">Design with AI, simplified</h1>
          <p className="text-lg mb-8">
            Our platform makes it easy to create stunning designs for any purpose using the power of artificial intelligence.
          </p>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="mt-1 bg-white/20 p-1 rounded-full">
                <Mail size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-medium">Smart prompt suggestions</h3>
                <p className="text-sm text-white/80">Our AI helps you create the perfect prompt for your design needs</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="mt-1 bg-white/20 p-1 rounded-full">
                <User size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-medium">Personalized experience</h3>
                <p className="text-sm text-white/80">Customize the platform with your brand colors and logo</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="mt-1 bg-white/20 p-1 rounded-full">
                <Layers size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-medium">All-in-one design platform</h3>
                <p className="text-sm text-white/80">Create designs for social media, presentations, websites and more</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
